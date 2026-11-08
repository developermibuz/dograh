"use client";

/**
 * MIB: список идущих звонков (Live calls). Данные - /api/v1/mib/live/runs (модуль mib_live
 * в Dograh API), обновление раз в 3 с. Клик по звонку - его страница с живым разговором.
 */
import { Radio } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { client } from "@/client/client.gen";
import { PageLayout, PageSection } from "@/components/layout/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth";

const POLL_MS = 3000;

interface LiveRun {
    id: number;
    workflow_id: number;
    created_at: string | null;
    caller_number: string | null;
    is_completed: boolean;
    last_event_ago: number;
}

function duration(from: string | null, now: number): string {
    if (!from) return "—";
    const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function LiveCallsPage() {
    const { user, redirectToLogin, loading } = useAuth();
    const [runs, setRuns] = useState<LiveRun[] | null>(null);
    const [enabled, setEnabled] = useState(true);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (!loading && !user) redirectToLogin();
    }, [loading, user, redirectToLogin]);

    useEffect(() => {
        if (loading || !user) return;
        let stop = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const poll = async () => {
            try {
                const res = await client.get<{ 200: { enabled: boolean; runs: LiveRun[] } }, unknown, false>({
                    url: "/api/v1/mib/live/runs",
                });
                const data = res.data as { enabled: boolean; runs: LiveRun[] } | undefined;
                if (data) {
                    setRuns(data.runs ?? []);
                    setEnabled(data.enabled !== false);
                }
            } catch {
                setRuns((prev) => prev ?? []);
            }
            if (!stop) timer = setTimeout(poll, POLL_MS);
        };
        poll();
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => {
            stop = true;
            if (timer) clearTimeout(timer);
            clearInterval(tick);
        };
    }, [loading, user]);

    return (
        <PageLayout title="Live Calls" description="Calls in progress right now. Open a call to follow the conversation live.">
            <PageSection title="In progress">
                {runs === null ? (
                    <Skeleton className="h-32 w-full" />
                ) : !enabled ? (
                    <p className="text-sm text-muted-foreground">Live view is turned off on the server (MIB_LIVE_VIEW=0).</p>
                ) : runs.length === 0 ? (
                    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                        <Radio className="h-4 w-4" /> No calls in progress
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Run</TableHead>
                                <TableHead>Caller</TableHead>
                                <TableHead>Started</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {runs.map((run) => (
                                <TableRow key={run.id}>
                                    <TableCell>
                                        <Link className="font-medium underline-offset-4 hover:underline"
                                            href={`/workflow/${run.workflow_id}/run/${run.id}`}>
                                            #{run.id}
                                        </Link>
                                    </TableCell>
                                    <TableCell>{run.caller_number ?? "—"}</TableCell>
                                    <TableCell>{run.created_at ? new Date(run.created_at).toLocaleTimeString() : "—"}</TableCell>
                                    <TableCell>{run.is_completed ? "—" : duration(run.created_at, now)}</TableCell>
                                    <TableCell>
                                        {run.is_completed
                                            ? <Badge variant="secondary">Ended</Badge>
                                            : <Badge className="bg-red-600 text-white hover:bg-red-600">Live</Badge>}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </PageSection>
        </PageLayout>
    );
}
