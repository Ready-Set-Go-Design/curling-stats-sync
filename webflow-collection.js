{
  "standings": {
    "collectionId": "69b06a2116547560be7f9055",
    "match": {
      "type": "field",
      "csvColumn": "Slug",
      "fieldSlug": "slug"
    },
    "fieldMap": {
      "Name": "name",
      "Slug": "slug",
      "Archived": "is-archived",
      "Draft": "is-draft",
      "Team": "team",
      "Rank": "rank",
      "Wins": "wins",
      "Losses": "losses",
      "Points": "points",
      "LSD": "lsd"
    },
    "references": {
      "Team": {
        "collectionId": "69290cb7dc63064ea78d7b43",
        "lookupField": "slug"
      }
    }
  },
  "matches": {
    "collectionId": "6998875257d282acf40a2119",
    "match": {
      "type": "field",
      "csvColumn": "Slug",
      "fieldSlug": "slug"
    },
    "fieldMap": {
      "Name": "name",
      "Page Title": "page-title",
      "Date": "date",
      "Stage": "stage",
      "Team 1": "team-1",
      "Team 2": "team-2",
      "Slug": "slug",
      "Archived": "is-archived",
      "Draft": "is-draft",
      "Status": "status",
      "Game A - Womens": "game-a---womens",
      "Game B - Mens": "game-b---mens",
      "Game C - Mixed": "game-c---mixed",
      "Team 1 Score": "team-1-score",
      "Team 2 Score": "team-2-score",
      "Ticket Link": "ticket-link"
    },
    "references": {
      "Team 1": {
        "collectionId": "69290cb7dc63064ea78d7b43",
        "lookupField": "slug"
      },
      "Team 2": {
        "collectionId": "69290cb7dc63064ea78d7b43",
        "lookupField": "slug"
      },
      "Game A - Womens": {
        "collectionId": "698ced7e2c5b161a6c1d0737",
        "lookupField": "slug"
      },
      "Game B - Mens": {
        "collectionId": "698ced7e2c5b161a6c1d0737",
        "lookupField": "slug"
      },
      "Game C - Mixed": {
        "collectionId": "698ced7e2c5b161a6c1d0737",
        "lookupField": "slug"
      }
    }
  },
  "games": {
    "collectionId": "698ced7e2c5b161a6c1d0737",
    "match": {
      "type": "field",
      "csvColumn": "Slug",
      "fieldSlug": "slug"
    },
    "fieldMap": {
      "Name": "name",
      "Slug": "slug",
      "Archived": "is-archived",
      "Draft": "is-draft",
      "Tournament phase": "tournament-phase",
      "Status": "status-2",
      "Game": "game",
      "Red team": "red-team-2",
      "Yellow team": "yellow-team-2",
      "Red Score": "home-score",
      "Yellow Score": "away-score",
      "Hammer": "hammer",
      "Red End 1": "red-end-1",
      "Yellow End 1": "yellow-end-1",
      "Red End 2": "red-end-2",
      "Yellow End 2": "yellow-end-2",
      "Red End 3": "red-end-3",
      "Yellow End 3": "yellow-end-3",
      "Red End 4": "red-end-4",
      "Yellow End 4": "yellow-end-4",
      "Red End 5": "red-end-5",
      "Yellow End 5": "yellow-end-5",
      "Red End 6": "red-end-6",
      "Yellow End 6": "yellow-end-6",
      "Red End 7": "red-end-7",
      "Yellow End 7": "yellow-end-7",
      "Red End 8": "red-end-8",
      "Yellow End 8": "yellow-end-8",
      "Red End 9": "red-end-9",
      "Yellow End 9": "yellow-end-9",
      "Red End 10": "red-end-10",
      "Yellow End 10": "yellow-end-10",
      "Red Player 1": "player-1-2",
      "Red Player 2": "player-2",
      "Red Player 3": "player-3",
      "Red Player 4": "player-4",
      "Yellow Player 1": "yellow-player-1",
      "Yellow Player 2": "yellow-player-2",
      "Yellow Player 3": "yellow-player-3",
      "Yellow Player 4": "yellow-player-4"
    },
    "references": {
      "Red team": {
        "collectionId": "69290cb7dc63064ea78d7b43",
        "lookupField": "slug"
      },
      "Yellow team": {
        "collectionId": "69290cb7dc63064ea78d7b43",
        "lookupField": "slug"
      },
      "Red Player 1": {
        "collectionId": "69290c8e367d23fceb9c9187",
        "lookupField": "slug"
      },
      "Red Player 2": {
        "collectionId": "69290c8e367d23fceb9c9187",
        "lookupField": "slug"
      },
      "Red Player 3": {
        "collectionId": "69290c8e367d23fceb9c9187",
        "lookupField": "slug"
      },
      "Red Player 4": {
        "collectionId": "69290c8e367d23fceb9c9187",
        "lookupField": "slug"
      },
      "Yellow Player 1": {
        "collectionId": "69290c8e367d23fceb9c9187",
        "lookupField": "slug"
      },
      "Yellow Player 2": {
        "collectionId": "69290c8e367d23fceb9c9187",
        "lookupField": "slug"
      },
      "Yellow Player 3": {
        "collectionId": "69290c8e367d23fceb9c9187",
        "lookupField": "slug"
      },
      "Yellow Player 4": {
        "collectionId": "69290c8e367d23fceb9c9187",
        "lookupField": "slug"
      }
    }
  }
}