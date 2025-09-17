import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    Pressable,
    FlatList,
    ListRenderItem,
    NativeScrollEvent,
    NativeSyntheticEvent,
    KeyboardAvoidingView,
    Platform,
    Alert
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

// Question types
export type QuestionType = 'text' | 'number' | 'single' | 'multi' | 'group'
type GroupItem = {
    key: string;
    label: string;
    min?: number;
    max: number;
    suffix?: string;
    placeholder?: string;
}
export type Question = {
    id: string;
    title: string;
    subtitle?: string;
    type: QuestionType;
    required?: boolean;
    options?: string[];
    placeholder?: string;
    keyboard?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
    validate?: (value: any) => string | null; // return null if valid or error message if invalid
    items?: GroupItem[];
    sumTarget?: number;
    enforceInteger?: boolean;
}
export type Answers = Record<string, any>;

const STORAGE_KEY = "onboarding_answers_v1";
const STORAGE_STEP_KEY = "onboarding_step_v1";

const QUESTIONS: Question[] = [
    {
        id: 'name',
        title: 'What is your name?',
        type: 'text',
        required: true,
        placeholder: 'Enter your name',
        validate: (value) => {
            return (!value || value.trim().length < 2) ? "Enter at least 2 characters" : null;
        }
    },
    {
        id: 'age',
        title: 'What is your age?',
        type: 'number',
        required: true,
        placeholder: 'Enter your age',
        validate: (value) => {
            return (!value || isNaN(value) || value < 1 || value > 120) ? "Enter a valid age" : null;
        }
    },
    {
        id: 'sex',
        title: 'Gender?',
        type: 'single',
        required: true,
        options: ['F', 'M'],
        validate: (value) => {
            return (!value || (value !== 'F' && value !== 'M')) ? "Select an option" : null;
        }
    },
    {
        id: 'weight',
        title: 'Weight',
        type: 'number',
        required: true,
        placeholder: 'Enter your weight (lbs)',
        validate: (value) => {
            return (!value || (value < 50 || value > 500)) ? "Enter a valid weight" : null;
        }
    },
    {
        id: 'height',
        title: 'Height',
        type: 'group',
        required: true,
        enforceInteger: true,
        items: [
            { key: "feet", label: "Feet", min: 0, max: 8, suffix: "ft", },
            { key: "inches", label: "Inches", min: 0, max: 11, suffix: "in" }
        ],
        validate: (value) => {
            // Expect: { feet: string|number, inches: string|number }
            if (!value || typeof value !== "object") return "Enter feet and inches.";

            const has = (x: any) => x !== "" && x !== null && x !== undefined;
            if (!has(value.feet) || !has(value.inches)) return "Enter feet and inches.";

            const toInt = (x: any) =>
                /^\d+$/.test(String(x)) ? parseInt(String(x), 10) : NaN;

            const ft = toInt(value.feet);
            const inch = toInt(value.inches);

            if (Number.isNaN(ft) || Number.isNaN(inch)) {
                return "Use whole numbers for feet and inches.";
            }
            if (ft < 0 || ft > 8) return "Feet must be between 0 and 8.";
            if (inch < 0 || inch > 11) return "Inches must be between 0 and 11.";
            if (ft === 0 && inch === 0) return "Height cannot be 0.";

            return null; // valid
        }
    },
    {
        id: 'TDEE',
        title: 'Activity Level',
        type: 'single',
        required: true,
        options: ['Sedentary (little to no exercise)', 'Lightly Active (1-3 days a week)', 'Moderately Active (3-5 days a week)', 'Very Active (6-7 days a week)'],
        validate: (value) => {
            return (!value) ? "Choose an option" : null;
        }
    },
    {
        id: 'Goal',
        title: 'Set your weight loss/gain goal',
        type: 'text',
        required: true,
        placeholder: '# of lbs gain/loss (+/-) per week',
        validate: (value) => {
            return (!value || (value < -2.5 || value > 2)) ? "Choose a safer alternative within a loss of 2.5 lbs or gain of 2 lbs per week" : null;
        }
    },
    {
        id: "macroSplit",
        title: "How do you prefer to distribute your daily macros?",
        subtitle: "Must add up to 100%",
        type: "group",
        required: true,
        sumTarget: 100,
        enforceInteger: true,
        items: [
            { key: "breakfast", label: "Breakfast", min: 0, max: 100, suffix: "%", placeholder: "e.g. 25" },
            { key: "lunch", label: "Lunch", min: 0, max: 100, suffix: "%", placeholder: "e.g., 35" },
            { key: "dinner", label: "Dinner", min: 0, max: 100, suffix: "%", placeholder: "e.g., 30" },
            { key: "snacks", label: "Snacks", min: 0, max: 100, suffix: "%", placeholder: "e.g., 10" },
        ],
        validate: (v) => {
            if (!v || typeof v !== "object") return "Please enter your split.";
            const toNum = (x: any) => Number.isFinite(+x) ? +x : NaN;
            const items = ["breakfast", "lunch", "dinner", "snacks"];
            for (const k of items) {
                const n = toNum(v[k]);
                if (Number.isNaN(n)) return "All values must be numbers.";
                if (n < 0 || n > 100) return "Each value must be between 0 and 100.";
            }
            const sum = items.reduce((s, k) => s + (toNum(v[k]) || 0), 0);
            if (sum !== 100) return "Values must add up to 100%.";
            return null;
        },
    },
    {
        id: 'diet_pattern',
        title: "Dietary patterns",
        type: 'single',
        required: true,
        options: ["No Specific Diet", "Vegetarian", "Vegan", "Pescatarian", "Ketogenic", "Paleo", "Mediterranean", "DASH (heart-healthy)", "Intermittent Fasting", "Whole30"],
        validate: (value) => {
            return (!value) ? "Choose an option" : null;
        }
    },
    {
        id: "allergies",
        title: "Allergies & Intolerances",
        subtitle: "Select all that apply",
        type: "multi",
        required: false, // set true if you want at least one selection
        options: [
            "Dairy/Lactose",
            "Gluten/Wheat",
            "Nuts (Tree nuts)",
            "Peanuts",
            "Shellfish",
            "Fish",
            "Eggs",
            "Soy",
            "Sesame",
            "Other" // <-- keep EXACTLY "Other" to trigger the free-text input
        ],
        // (Optional) Enforce that if "Other" is selected, the user must type something.
        validate: (v) => {
            const arr = Array.isArray(v) ? v : [];
            const pickedOther = arr.some((x) => x === "Other" || x.startsWith("Other:"));
            const specified = arr.some((x) => x.startsWith("Other:"));
            if (pickedOther && !specified) return "Please specify your 'Other' allergy/intolerance.";
            return null;
        },
    },
    {
        id: "foodDislikes",
        title: "Food Dislikes/Avoidances",
        subtitle: "Select all that apply",
        type: "multi",
        required: false,
        options: [
            "Red meat",
            "Pork",
            "Mushrooms",
            "Seafood",
            "Spicy food",
            "Very sweet foods",
            "Raw foods (sushi, salads)",
            "Organ meats",
            "Other"
        ],
        validate: (v) => {
            const arr = Array.isArray(v) ? v : [];
            const pickedOther = arr.some((x) => x === "Other" || x.startsWith("Other:"));
            const specified = arr.some((x) => x.startsWith("Other:"));
            if (pickedOther && !specified) return "Please specify your 'Other' dislike/avoidance.";
            return null;
        },
    },
    {
        id: 'cooking_experience',
        title: 'Choose your cooking experience level',
        type: 'single',
        required: true,
        options: ['Beginner (15-30 min meals, basic techniques)', 'Intermediate (30-60 min meals, moderate complexity)', 'Advanced (60+ min meals, complex techniques)', 'Professional (no time/complexity limits)'],
        validate: (value) => {
            return (!value) ? "Choose an option" : null;
        }
    },
    {
        id: 'breakfast_prep_time',
        title: 'Breakfast prep time',
        type: 'single',
        options: ['<5 min (grab & go)', '5-15 min', '15-30 min', '30+ min']
    },
    {
        id: 'lunch_prep_time',
        title: 'Lunch prep time',
        type: 'single',
        options: ['<10 min (work lunch)',  '10-20 min', '20-40 min', '40+ min']
    },
    {
        id: 'dinner_prep_time',
        title: 'Dinner prep time', 
        type: 'single',
        options: ['<15 min (quick dinner)', '15-30 min', '30-60 min', '60+ min']
    },
    {
        id: 'snack prep time',
        title: 'Snack prep time',
        type: 'single',
        options: ['<5 min', '5-15 min', '15+ min']
    },
    {
        id: 'meal_prep',
        title: 'Meal Prep Preferences',
        type: 'single',
        options: ['Cook fresh every meal', 'Batch cook on weekends (2-3 days worth)', 'Weekly meal prep (5-7 days worth)', 'Mix of fresh + prepped components', 'Prefer freezable meals'],
    }


]

const Slide = ({ children, pageWidth }: { children: React.ReactNode; pageWidth: number }) => (
    <View
        style={{
            width: pageWidth || 0,
            flex: 1,
            paddingHorizontal: 20,
            paddingTop: 36,
            paddingBottom: 24,
            alignItems: "center",
            justifyContent: "center"
        }}
    >
        {children}
    </View>
);

const Pill = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: selected ? "#22d3ee" : "#334155",
            backgroundColor: selected ? "#083344" : "#0b1220",
            marginRight: 8,
            marginBottom: 8,
        }}
    >
        <Text style={{ color: "#e2e8f0", fontSize: 15 }}>{label}</Text>
    </Pressable>
);

export default function Landing({ onComplete }: { onComplete?: (a: Answers) => void }) {
    const [answers, setAnswers] = useState<Answers>({});

    const [index, setIndex] = useState(0);
    const listRef = useRef<FlatList<Question>>(null);

    const progress = useMemo(() => (index + 1) / QUESTIONS.length, [index]);
    const currentQ = QUESTIONS[index];
    const currentValue = answers[currentQ?.id];

    const [pageWidth, setPageWidth] = useState<number>(0);


    const currentError = useMemo(() => {
        if (!currentQ) return null;
        if (currentQ.required) {
            const empty = currentValue == null || (Array.isArray(currentValue) && currentValue.length === 0) || (typeof currentValue === "string" && currentValue.trim() === "");
            if (empty) return "This field is required";
        }
        if (currentQ.validate) return currentQ.validate(currentValue);
        return null
    }, [currentQ, currentValue])

    // load saved state
    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(STORAGE_KEY);
                const rawStep = await AsyncStorage.getItem(STORAGE_STEP_KEY);
                if (raw) setAnswers(JSON.parse(raw));
                if (rawStep) setIndex(Math.min(Number(rawStep) || 0, QUESTIONS.length - 1));
            } catch { }
        })();
    }, []);

    // Persist state
    useEffect(() => {
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(answers)).catch(() => { });
    }, [answers]);

    useEffect(() => {
        AsyncStorage.setItem(STORAGE_STEP_KEY, String(index)).catch(() => { });
    }, [index]);

    const setAnswer = (id: string, value: any) => setAnswers((p) => ({ ...p, [id]: value }));

    const go = useCallback((to: number) => {
        const clamped = Math.max(0, Math.min(to, QUESTIONS.length - 1));
        setIndex(clamped);
        listRef.current?.scrollToIndex({ index: clamped, animated: true, viewPosition: 0 });
    }, []);

    const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const width = e.nativeEvent.layoutMeasurement.width;
        const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
        if (newIndex !== index) setIndex(newIndex);
    };

    const canNext = !currentError

    const submit = () => {
        // Final validation
        for (const q of QUESTIONS) {
            const v = answers[q.id];
            const empty = v == null || (Array.isArray(v) && v.length === 0) || (typeof v === "string" && v.trim() === "");
            if (q.required && empty) {
                const idx = QUESTIONS.findIndex((qq) => qq.id === q.id)
                go(idx);
                Alert.alert("Missing info", "Please fill out the required question.");
                return;
            }
            if (q.validate) {
                const err = q.validate(v)
                if (err) {
                    const idx = QUESTIONS.findIndex((qq) => qq.id === q.id)
                    go(idx);
                    Alert.alert("Check your answer", err);
                    return;
                }
            }
        }
        onComplete?.(answers);
        Alert.alert("All set!", "Thanks for sharing ✨", [
            {
                onPress: async () => {
                    try {
                        await AsyncStorage.multiRemove([STORAGE_KEY, STORAGE_STEP_KEY]);
                    } catch { }
                },
            },
        ]);
    }

    const renderItem: ListRenderItem<Question> = ({ item }) => {
        const value = answers[item.id];
        const cardWidth = Math.min(Math.max((pageWidth || 0) - 40, 280), 420);
        return (
            <Slide pageWidth={pageWidth}>
                {/* Card */}
                <View
                    style={{
                        width: cardWidth,
                        backgroundColor: "#0b1220",
                        borderRadius: 16,
                        padding: 18,
                        borderWidth: 1,
                        borderColor: "#1f2a44",
                        shadowColor: "#000",
                        shadowOpacity: 0.2,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 6 },
                    }}
                >
                    <Text style={{ color: "#e2e8f0", fontSize: 24, fontWeight: "800" }}>{item.title}</Text>
                    {!!item.subtitle && (
                        <Text style={{ color: "#94a3b8", marginTop: 6 }}>{item.subtitle}</Text>
                    )}
                    {/* Field */}
                    <View style={{ marginTop: 18 }}>
                        {item.type === "text" || item.type === "number" ? (
                            <TextInput
                                accessibilityLabel={item.title}
                                placeholder={item.placeholder}
                                placeholderTextColor="#64748b"
                                value={value ?? ""}
                                onChangeText={(t) => setAnswer(item.id, t)}
                                keyboardType={item.keyboard === "numeric" ? "number-pad" : item.keyboard ?? "default"}
                                style={{
                                    borderWidth: 1,
                                    borderColor: "#334155",
                                    borderRadius: 12,
                                    padding: 14,
                                    fontSize: 16,
                                    color: "#e2e8f0",
                                    backgroundColor: "#0f172a",
                                }}
                                returnKeyType="done"
                            />
                        ) : item.type === "single" ? (
                            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                                {item.options?.map((opt) => (
                                    <Pill
                                        key={opt}
                                        label={opt}
                                        selected={value === opt}
                                        onPress={() => setAnswer(item.id, opt)}
                                    />
                                ))}
                            </View>
                        ) : item.type === "multi" ? (
                            <View>
                                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                                    {item.options?.map((opt) => {
                                        const arr: string[] = Array.isArray(value) ? value : [];

                                        const isOther = /^other$/i.test(opt);
                                        const otherSelected = arr.some((v) => v === "Other" || v.startsWith("Other:"));
                                        const isOn = isOther ? otherSelected : arr.includes(opt);

                                        const toggle = () => {
                                            if (isOther) {
                                                // toggle the Other chip (and clear any saved Other text)
                                                if (otherSelected) {
                                                    setAnswer(item.id, arr.filter((v) => v !== "Other" && !v.startsWith("Other:")));
                                                } else {
                                                    setAnswer(item.id, [...arr, "Other"]);
                                                }
                                            } else {
                                                setAnswer(item.id, isOn ? arr.filter((x) => x !== opt) : [...arr, opt]);
                                            }
                                        };

                                        return <Pill key={opt} label={opt} selected={isOn} onPress={toggle} />;
                                    })}
                                </View>

                                {/* Free-text box appears only when Other is selected */}
                                {item.options?.some((o) => /^other$/i.test(o)) && (() => {
                                    const arr: string[] = Array.isArray(value) ? value : [];
                                    const otherSelected = arr.some((v) => v === "Other" || v.startsWith("Other:"));
                                    if (!otherSelected) return null;

                                    const currentOther = (arr.find((v) => v.startsWith("Other:")) || "Other:").slice(6).trim();

                                    return (
                                        <View style={{ marginTop: 12 }}>
                                            <Text style={{ color: "#94a3b8", marginBottom: 6 }}>Other</Text>
                                            <TextInput
                                                accessibilityLabel="Other"
                                                placeholder="Type your option"
                                                placeholderTextColor="#64748b"
                                                value={currentOther}
                                                onChangeText={(t) => {
                                                    const next = arr.filter((v) => v !== "Other" && !v.startsWith("Other:"));
                                                    const cleaned = t.trim();
                                                    if (cleaned.length > 0) next.push(`Other: ${cleaned}`);
                                                    else next.push("Other"); // keep selection without text
                                                    setAnswer(item.id, next);
                                                }}
                                                keyboardType="default"
                                                style={{
                                                    borderWidth: 1,
                                                    borderColor: "#334155",
                                                    borderRadius: 12,
                                                    padding: 14,
                                                    fontSize: 16,
                                                    color: "#e2e8f0",
                                                    backgroundColor: "#0f172a",
                                                }}
                                                returnKeyType="done"
                                            />
                                        </View>
                                    );
                                })()}
                            </View>
                        ) : item.type === "group" ? (
                            <View>
                                {(() => {
                                    const groupValue: Record<string, string> = (value ?? {});
                                    const toNum = (x: any) => Number.isFinite(+x) ? +x : 0;

                                    // helper to set a single field (optionally auto-fill the last remaining field)
                                    const setGroupField = (k: string, t: string) => {
                                        // sanitize to digits only; optionally enforce integer
                                        let cleaned = t.replace(/[^0-9]/g, "");
                                        if (!cleaned) cleaned = "";

                                        // next object
                                        const next = { ...groupValue, [k]: cleaned };

                                        // Optional: auto-fill last remaining field to hit sumTarget exactly
                                        if (item.sumTarget && item.items && item.items.length > 1) {
                                            const keys = item.items.map(i => i.key);
                                            const emptyKeys = keys.filter(key => (next[key] ?? "") === "");
                                            if (emptyKeys.length === 1) {
                                                const filledSum = keys
                                                    .filter(key => key !== emptyKeys[0])
                                                    .reduce((s, key) => s + toNum(next[key]), 0);
                                                const remainder = Math.max(0, item.sumTarget - filledSum);
                                                next[emptyKeys[0]] = String(remainder);
                                            }
                                        }

                                        setAnswer(item.id, next);
                                    };

                                    const sum = (item.items ?? []).reduce((s, it) => s + toNum(groupValue[it.key]), 0);
                                    const sumOk = item.sumTarget == null ? true : sum === item.sumTarget;

                                    return (
                                        <View>
                                            {(item.items ?? []).map((it) => (
                                                <View key={it.key} style={{ marginBottom: 12 }}>
                                                    <Text style={{ color: "#94a3b8", marginBottom: 6 }}>{it.label}</Text>
                                                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                                                        <TextInput
                                                            accessibilityLabel={it.label}
                                                            placeholder={it.placeholder}
                                                            placeholderTextColor="#64748b"
                                                            value={groupValue[it.key] ?? ""}
                                                            keyboardType="number-pad"
                                                            maxLength={3}
                                                            onChangeText={(t) => {
                                                                // clamp to min/max if desired after input
                                                                const digits = t.replace(/[^0-9]/g, "");
                                                                let n = digits === "" ? "" : String(Math.min(Math.max(+digits, it.min ?? 0), it.max ?? 100));
                                                                setGroupField(it.key, n);
                                                            }}
                                                            style={{
                                                                flex: 1,
                                                                borderWidth: 1,
                                                                borderColor: "#334155",
                                                                borderRadius: 12,
                                                                padding: 14,
                                                                fontSize: 16,
                                                                color: "#e2e8f0",
                                                                backgroundColor: "#0f172a",
                                                            }}
                                                            returnKeyType="done"
                                                        />
                                                        <Text style={{ marginLeft: 8, color: "#94a3b8", fontSize: 16 }}>{it.suffix ?? ""}</Text>
                                                    </View>
                                                </View>
                                            ))}

                                            {/* Sum status */}
                                            {item.sumTarget != null && (
                                                <Text style={{ marginTop: 4, color: sumOk ? "#22d3ee" : "#f87171" }}>
                                                    Total: {sum}/{item.sumTarget}%
                                                </Text>
                                            )}
                                        </View>
                                    );
                                })()}
                            </View>
                        ) : null}

                    </View>
                    {/* Inline error */}
                    {item.id === currentQ?.id && !!currentError && (
                        <Text style={{ color: "#f87171", marginTop: 10 }}>{currentError}</Text>
                    )}
                </View>
            </Slide>
        )
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1, backgroundColor: "#0f172a" }}
        >
            {/* Header + progress */}
            <View style={{ padding: 20, paddingBottom: 8 }}>
                <Text style={{ color: "#e2e8f0", fontSize: 18, fontWeight: "700" }}>Welcome 👋</Text>
                <View style={{ height: 8, backgroundColor: "#1e293b", borderRadius: 999, marginTop: 10 }}>
                    <View style={{
                        height: 8,
                        width: `${Math.round(progress * 100)}%`,
                        backgroundColor: "#22d3ee",
                        borderRadius: 999,
                    }} />
                </View>
                {/* dots */}
                <View style={{ flexDirection: "row", marginTop: 10 }}>
                    {QUESTIONS.map((_, i) => (
                        <View
                            key={i}
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                marginRight: 6,
                                backgroundColor: i === index ? "#22d3ee" : "#334155",
                            }}
                        />
                    ))}
                </View>
            </View>
            {/* Slides */}
            <View style={{ flex: 1 }} onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}>
                <FlatList
                    ref={listRef}
                    data={QUESTIONS}
                    keyExtractor={(q) => q.id}
                    renderItem={renderItem}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={onMomentumEnd}
                    keyboardShouldPersistTaps="handled"
                    extraData={pageWidth}
                // Note: We rely on scrollToIndex; RN measures width automatically per page.
                />
            </View>


            {/* Footer actions */}
            <View style={{ flexDirection: "row", gap: 12, padding: 20 }}>
                <Pressable
                    onPress={() => go(index - 1)}
                    disabled={index === 0}
                    style={{
                        flex: 1,
                        paddingVertical: 14,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: index === 0 ? "#1e293b" : "#334155",
                        alignItems: "center",
                        backgroundColor: "#0b1220",
                        opacity: index === 0 ? 0.5 : 1,
                    }}
                >
                    <Text style={{ color: "#e2e8f0" }}>Back</Text>
                </Pressable>


                {index < QUESTIONS.length - 1 ? (
                    <Pressable
                        onPress={() => canNext && go(index + 1)}
                        disabled={!canNext}
                        style={{
                            flex: 2,
                            paddingVertical: 14,
                            borderRadius: 12,
                            alignItems: "center",
                            backgroundColor: canNext ? "#22d3ee" : "#155e75",
                        }}
                    >
                        <Text style={{ color: "#04141c", fontWeight: "800" }}>Next</Text>
                    </Pressable>
                ) : (
                    <Pressable
                        onPress={submit}
                        style={{
                            flex: 2,
                            paddingVertical: 14,
                            borderRadius: 12,
                            alignItems: "center",
                            backgroundColor: "#22d3ee",
                        }}
                    >
                        <Text style={{ color: "#04141c", fontWeight: "800" }}>Submit</Text>
                    </Pressable>
                )}
            </View>

            {/* Skip link */}
            <View style={{ alignItems: "center", paddingBottom: 12 }}>
                {index < QUESTIONS.length - 1 && (
                    <Pressable onPress={() => go(QUESTIONS.length - 1)} accessibilityRole="button">
                        <Text style={{ color: "#94a3b8" }}>Skip to last question</Text>
                    </Pressable>
                )}
            </View>

        </KeyboardAvoidingView>
    )

}
