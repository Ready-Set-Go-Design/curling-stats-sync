import { NextRequest, NextResponse } from 'next/server';
import { getCollectionsConfig, getSyncSharedSecret } from './../../../lib/config';
import { runCollectionSync } from './../../../lib/sync-source';
import { TriggerSyncRequest } from './../../../lib/types';

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

        const body = (await request.json().catch(() => ({}))) as TriggerSyncRequest;
        const collectionConfig = getCollectionsConfig();
        const requestedKeys = body.collectionKeys?.length
            ? body.collectionKeys
            : body.collectionKey
              ? [body.collectionKey]
              : Object.keys(collectionConfig);

        const results = [];

        for (const collectionKey of requestedKeys) {
            const result = await runCollectionSync({
                collectionKey,
                useSheetTab: true,
                mode: body.mode ?? 'live',
                dryRun: body.dryRun ?? false
            });

            results.push(result);
        }

        return NextResponse.json({
            synced: results.length,
            results
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown trigger sync error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
