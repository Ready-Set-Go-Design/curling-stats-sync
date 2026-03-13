import { NextRequest, NextResponse } from 'next/server';
import { getCollectionsConfig, getSyncSharedSecret, getWebflowToken } from './../../../lib/config';
import { PullRequest } from './../../../lib/types';
import { pullCollection } from './../../../lib/webflow';

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

        const body = (await request.json()) as PullRequest;
        const collections = getCollectionsConfig();
        const config = collections[body.collectionKey];

        if (!config) {
            return NextResponse.json({ error: `Unknown collection key: ${body.collectionKey}` }, { status: 400 });
        }

        const result = await pullCollection({
            token: getWebflowToken(),
            config,
            collectionKey: body.collectionKey
        });

        return NextResponse.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown pull sync error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
