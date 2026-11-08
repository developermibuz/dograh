"use client";

/**
 * MIB: живой просмотр идущего телефонного звонка.
 * События берутся из API /api/v1/mib/live (модуль mib_live в Dograh API) раз в секунду
 * и рисуются теми же блоками, что и разговор в тесте и запись звонка - вид одинаковый.
 */
import { useEffect, useRef, useState } from "react";

import { client } from "@/client/client.gen";
import {
    ConversationContainer,
    ConversationTimeline,
    type RealtimeFeedbackEvent,
} from "@/components/workflow/conversation";
import { conversationItemsFromRealtimeFeedbackEvents } from "@/components/workflow/conversation/adapters/fromRealtimeFeedback";
import { countConversationMessages } from "@/components/workflow/conversation/utils";

const POLL_MS = 1000;

interface LiveEventsResponse {
    events: RealtimeFeedbackEvent[];
    next: number;
    is_completed: boolean;
}

export function useLiveRunEvents(runId: number, enabled = true) {
    const [events, setEvents] = useState<RealtimeFeedbackEvent[]>([]);
    const [completed, setCompleted] = useState(false);
    const [error, setError] = useState(false);
    const next = useRef(0);

    useEffect(() => {
        if (!enabled) return;
        let stop = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const poll = async () => {
            try {
                const res = await client.get<{ 200: LiveEventsResponse }, unknown, false>({
                    url: "/api/v1/mib/live/runs/{run_id}/events",
                    path: { run_id: runId },
                    query: { after: next.current },
                });
                const data = res.data as LiveEventsResponse | undefined;
                if (data) {
                    if (data.events?.length) {
                        next.current = data.next;
                        setEvents((prev) => [...prev, ...data.events]);
                    }
                    setCompleted(Boolean(data.is_completed));
                    setError(false);
                    if (data.is_completed) return;   // звонок закончился - дальше не спрашиваем
                } else {
                    setError(true);
                }
            } catch {
                setError(true);
            }
            if (!stop) timer = setTimeout(poll, POLL_MS);
        };
        poll();
        return () => {
            stop = true;
            if (timer) clearTimeout(timer);
        };
    }, [runId, enabled]);

    return { events, completed, error };
}

export function LiveRunPanel({ runId, onCompleted }: { runId: number; onCompleted?: () => void }) {
    const { events, completed, error } = useLiveRunEvents(runId);
    // как в сохранённом звонке: по времени события (реплика абонента попадает в буфер позже
    // вызовов инструментов, которые она вызвала); при равном времени - порядок поступления
    const sorted = events
        .map((e, i) => ({ e, i, t: String((e as { timestamp?: string }).timestamp ?? "") }))
        .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.i - b.i))
        .map((x) => x.e);
    const items = conversationItemsFromRealtimeFeedbackEvents(sorted);

    useEffect(() => {
        if (completed && onCompleted) {
            // запись и итоговая расшифровка сохраняются через несколько секунд после конца звонка
            const t = setTimeout(onCompleted, 4000);
            return () => clearTimeout(t);
        }
    }, [completed, onCompleted]);

    return (
        <ConversationContainer
            title={completed ? "Call Transcript" : "Live Transcript"}
            status={completed ? "ended" : "live"}
            messageCount={countConversationMessages(items) || undefined}
        >
            <ConversationTimeline
                items={items}
                autoScroll
                emptyState={{
                    title: error ? "Live view unavailable" : "Waiting for the conversation",
                    subtitle: error
                        ? "Could not load live events for this call"
                        : "Messages will appear here as the call goes on",
                }}
            />
        </ConversationContainer>
    );
}
