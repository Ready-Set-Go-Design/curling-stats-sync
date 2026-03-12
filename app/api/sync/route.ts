import { NextRequest, NextResponse } from 'next/server';
import { getSyncSharedSecret } from './../../lib/config';
import { SyncRequest } from './../../lib/types';
import { runCollectionSync } from './../../lib/sync-source';

function isAuthorized(request: NextRequest): boolean {
    const configuredSecret = getSyncSharedSecret();

    if (!configuredSecret) {
        return true;
    }

    const providedSecret = request.headers.get('x-sync-secret') ?? request.nextUrl.searchParams.get('secret') ?? '';

    return providedSecret === configuredSecret;
}

export async function POST(request: NextRequest) {
    try {
        if (!isAuthorized(request)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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
