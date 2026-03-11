import { NextRequest, NextResponse } from 'next/server';
import { SyncRequest } from './../../lib/types';
import { runCollectionSync } from './../../lib/sync-source';

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as SyncRequest;
        const result = await runCollectionSync({
            collectionKey: body.collectionKey,
            csvText: body.csvText,
            csvUrl: body.csvUrl,
            useSheetTab: body.useSheetTab,
            mode: body.mode ?? 'live',
            dryRun: body.dryRun ?? false
        });

        return NextResponse.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown sync error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
