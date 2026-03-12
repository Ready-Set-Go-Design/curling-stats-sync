import { readFile } from "node:fs/promises";

function printUsage() {
    console.log(`Usage:
  npm run sync:test -- --collection <key> --file <path> [--mode staged|live] [--apply] [--url <baseUrl>]

Examples:
  npm run sync:test -- --collection standings --file ./tmp/standings.csv
  npm run sync:test -- --collection standings --file ./tmp/standings.csv --apply
  npm run sync:test -- --collection matches --file ./tmp/matches.csv --mode live --url http://127.0.0.1:3000
`);
}

function parseArgs(argv) {
    const args = {
        mode: "staged",
        dryRun: true,
        url: "http://127.0.0.1:3000"
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === "--help" || arg === "-h") {
            args.help = true;
            continue;
        }

        if (arg === "--apply") {
            args.dryRun = false;
            continue;
        }

        if (arg === "--collection") {
            args.collectionKey = argv[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--file") {
            args.file = argv[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--mode") {
            args.mode = argv[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--url") {
            args.url = argv[index + 1];
            index += 1;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        printUsage();
        return;
    }

    if (!args.collectionKey) {
        throw new Error("Missing required --collection value");
    }

    if (!args.file) {
        throw new Error("Missing required --file value");
    }

    if (!["staged", "live"].includes(args.mode)) {
        throw new Error(`Invalid --mode value: ${args.mode}`);
    }

    const csvText = await readFile(args.file, "utf8");
    const response = await fetch(`${args.url}/api/sync`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            collectionKey: args.collectionKey,
            csvText,
            mode: args.mode,
            dryRun: args.dryRun
        })
    });

    const body = await response.text();

    if (!response.ok) {
        throw new Error(`Sync failed (${response.status}): ${body}`);
    }

    console.log(body);
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
});
