// Verified from the CoreSports source code. Real names shown with the client's permission.
window.CORE_DATA = {
  "product": {
    "name": "CoreSports",
    "site": "https://www.coreswt.com",
    "oneLiner": "A pod is a six-wall soccer training cage: one wall lights up, the player strikes it, and a Raspberry Pi counts each hit."
  },
  "stats": [
    {
      "value": "11,600+",
      "label": "players"
    },
    {
      "value": "25,000+",
      "label": "monthly kiosk sessions"
    },
    {
      "value": "1.25M+",
      "label": "game events"
    },
    {
      "value": "123K+",
      "label": "coin/XP transactions"
    },
    {
      "value": "99.9%",
      "label": "session stability"
    }
  ],
  "pod": {
    "walls": [
      {
        "name": "Red",
        "color": "#E53935",
        "pin": "D17"
      },
      {
        "name": "Orange",
        "color": "#FB8C00",
        "pin": "D5"
      },
      {
        "name": "Yellow",
        "color": "#FDD835",
        "pin": "D13"
      },
      {
        "name": "Green",
        "color": "#43A047",
        "pin": "D25"
      },
      {
        "name": "Blue",
        "color": "#1E88E5",
        "pin": "D20"
      },
      {
        "name": "Purple",
        "color": "#8E24AA",
        "pin": "D27"
      }
    ],
    "ledsPerWall": 40,
    "gameSeconds": 90,
    "debounceMs": 100,
    "kioskDebounceMs": 50,
    "clutchSeconds": 30
  },
  "modes": [
    {
      "id": 1,
      "name": "Core OG",
      "rule": "One wall lights green as the target and another shows red for next; target and next can be the same wall (split colours). Hit the target to score. Always unlocked."
    },
    {
      "id": 2,
      "name": "Xpert",
      "rule": "Core OG rules, but the wall you just hit is not switched off, so more walls stay lit and you must track the real target. Unlocks at 100 games."
    },
    {
      "id": 3,
      "name": "Mirror",
      "rule": "Hit the wall opposite the lit one (default pairs: walls 1-4, 2-3, 5-6); the lit wall itself does not count. Playable from 25 games on the kiosk; the backend unlock badge fires at 50."
    },
    {
      "id": 4,
      "name": "Mirror X",
      "rule": "Mirror rules with the Xpert lighting, where hit walls stay lit. Unlocks at 200 games."
    },
    {
      "id": 5,
      "name": "Clutch",
      "rule": "Core OG rules, and target and next are never the same wall. After 60 s the lights turn blue and every hit counts 2. Unlocks at 150 games."
    }
  ],
  "states": [
    "idle",
    "start",
    "running",
    "end"
  ],
  "transitions": [
    {
      "from": "idle",
      "to": "start",
      "on": "Player taps an RFID band and is authenticated (after a new high score, staff start the next game from a dialog)"
    },
    {
      "from": "start",
      "to": "running",
      "on": "First hit arrives on hit_events, which starts the countdown"
    },
    {
      "from": "running",
      "to": "end",
      "on": "10 s after the score POST returns (time up, 350 ms end window, then the POST)"
    },
    {
      "from": "end",
      "to": "start",
      "on": "2 s later, if a next player is already logged in and no new high score was set"
    },
    {
      "from": "end",
      "to": "idle",
      "on": "2 s later, if nobody is queued or a new high score paused auto start"
    },
    {
      "from": "start",
      "to": "idle",
      "on": "Player taps back or logs out before the first hit"
    }
  ],
  "triggers": [
    {
      "code": "1000",
      "name": "RESET_ALL",
      "meaning": "Sent first on every game start. Pi kills any running game thread and resets its score key."
    },
    {
      "code": "CONFIG#DELIM#{...}",
      "name": "CONFIG_SETUP",
      "meaning": "Game config JSON: game mode id, sequence type, duration, fixed sequence, two-player walls."
    },
    {
      "code": "100",
      "name": "START_GAME",
      "meaning": "Pi starts the game thread and lights the first target. Scoreboard resets to 00."
    },
    {
      "code": "200",
      "name": "END_GAME",
      "meaning": "Pi stops the game and plays the LED circle for 10 s. Scoreboard shows FINAL SCORE."
    },
    {
      "code": "ACTIVATE_CLUTCH",
      "name": "ACTIVATE_CLUTCH",
      "meaning": "Clutch only, after 60 s: Pi lights targets blue instead of green."
    },
    {
      "code": "300 / 301",
      "name": "PAUSE_GAME / RESUME_GAME",
      "meaning": "Pi ignores hits while a popup is on the kiosk, then resumes."
    },
    {
      "code": "50 / 700",
      "name": "START_DEMO_GAME / STOP_DEMO_GAME",
      "meaning": "Attract-mode light show when the pod is idle."
    },
    {
      "code": "1200",
      "name": "highScore",
      "meaning": "New personal best. Scoreboard plays the high score animation."
    },
    {
      "code": "1300#DELIM#{...}",
      "name": "singleGameReward",
      "meaning": "Good game or great game animation with score, XP, mode and style. Pi skips it."
    },
    {
      "code": "1100",
      "name": "greatGame",
      "meaning": "Legacy code still defined in the kiosk. Nothing publishes it now; 1300 replaced it."
    },
    {
      "code": "1700 / 1800 / 2000",
      "name": "battleCountDown / battleStart / battleResult",
      "meaning": "Battle Royale countdown, start without score reset, and result screen."
    },
    {
      "code": "0 / 1",
      "name": "OFF / RESTART",
      "meaning": "Pi runs shutdown or reboot."
    }
  ],
  "channels": [
    {
      "name": "commands",
      "publisher": "kiosk",
      "subscribers": [
        "pi",
        "scoreboard"
      ],
      "carries": "Control codes (1000, CONFIG, 100, 200, 1200, 1300 and others)"
    },
    {
      "name": "hit_events",
      "publisher": "pi",
      "subscribers": [
        "kiosk"
      ],
      "carries": "One message per valid hit; the value is str(random.random()), a throwaway nonce"
    },
    {
      "name": "score_updates",
      "publisher": "kiosk",
      "subscribers": [
        "scoreboard"
      ],
      "carries": "Running score as a string (plus equaliser in 1-pod and Battle Royale)"
    },
    {
      "name": "timer_updates",
      "publisher": "kiosk",
      "subscribers": [
        "scoreboard"
      ],
      "carries": "Seconds left, once per second"
    },
    {
      "name": "gameplay_timer",
      "publisher": "kiosk",
      "subscribers": [
        "scoreboard"
      ],
      "carries": "Game length in seconds, sent at game init"
    },
    {
      "name": "game_mode_name",
      "publisher": "kiosk",
      "subscribers": [
        "scoreboard"
      ],
      "carries": "Game mode display name, e.g. Core OG"
    },
    {
      "name": "battle_countdown",
      "publisher": "kiosk",
      "subscribers": [
        "scoreboard"
      ],
      "carries": "Battle Royale pre-game countdown seconds"
    },
    {
      "name": "battle_result",
      "publisher": "kiosk",
      "subscribers": [
        "scoreboard"
      ],
      "carries": "Battle Royale result JSON, shown after 2000"
    }
  ],
  "steps": [
    {
      "id": "rfid-login",
      "title": "Player taps RFID band",
      "node": "kiosk",
      "edge": "kiosk>api",
      "pod": "login",
      "plain": "The player taps a wristband on the kiosk, the backend confirms who they are, and the pod gets ready for their game.",
      "transport": "HTTPS + JWT (Retrofit/Dio)",
      "address": "POST /v1/players/authenticate",
      "payloadLang": "http",
      "payload": "POST https://api.example.com/v1/players/authenticate\nAuthorization: Bearer <kiosk access token>\nContent-Type: application/json\n\n{\"rfid\": \"0000001234\"}\n\n201 Created\n{\"id\": 1001, \"screen_name\": \"striker_9\", ...}",
      "why": [
        "RFID is the only login on the kiosk, so a player is in a game within a second and never types anything.",
        "The kiosk only moves idle to start when no game is in start or running, so a second tap during a game queues the next player instead of restarting the current one.",
        "The state change is the trigger: GameState.start runs initGameplay, so login code never talks to Redis directly."
      ],
      "files": [
        "kiosk-app/lib/screens/home/home_screen.dart:171",
        "kiosk-app/lib/view_models/gameplay_provider/game_state_provider.dart:77",
        "kiosk-app/lib/core/repository/retrofit/api_constants.dart:20"
      ]
    },
    {
      "id": "arm-pod",
      "title": "Kiosk sends game config",
      "node": "redis",
      "edge": "kiosk>redis",
      "pod": "config",
      "plain": "The kiosk tells the pod which game to run over a local message bus, and the Pi lights the first target wall.",
      "transport": "Redis Pub/Sub (local)",
      "address": "commands",
      "payloadLang": "text",
      "payload": "PUBLISH commands 1000\nPUBLISH commands CONFIG#DELIM#{\"gameMode\":\"1\",\"gameSequenceType\":\"random\",\"gameDuration\":\"90\",\"gameSequenceSeries\":null,\"twoPlayerActiveWalls\":null}\nPUBLISH game_mode_name \"Core OG\"\nPUBLISH gameplay_timer 90\nPUBLISH commands 100",
      "why": [
        "Redis runs on the Pi at 127.0.0.1:6379 and the Python game, kiosk and scoreboard all run on that same box, so a game never depends on the internet.",
        "1000 goes first so a stale game thread on the Pi is killed before a new config lands.",
        "Config rides the same commands channel as CONFIG#DELIM#{json}, so the Pi needs one subscription and one split to parse it.",
        "Mode name and duration go on their own channels for the scoreboard, so the scoreboard never parses game config."
      ],
      "files": [
        "kiosk-app/lib/view_models/gameplay_provider/gameplay_provider.dart:205",
        "pod-game/controllers/redis_controller.py:41",
        "pod-game/services/redis_service.py:17"
      ]
    },
    {
      "id": "wall-hit",
      "title": "Ball hits the lit wall",
      "node": "pi",
      "edge": "pi>redis",
      "pod": "hit",
      "plain": "When the ball hits the lit wall, a switch fires on the Pi and the Pi announces one hit and lights the next target.",
      "transport": "GPIO interrupt + Redis Pub/Sub (local)",
      "address": "hit_events",
      "payloadLang": "python",
      "payload": "GPIO.add_event_detect(pin, GPIO.RISING, callback=chan)  # chan: 100 ms lock\n\ndef handle_game_input(self, channel):\n    if self.pause_game:\n        return\n    hit = channel.pin in (self.current_input, board.D6)\n    if hit is True:\n        self.redis_service.redis_client.publish(\n            \"hit_events\", str(random.random()))  # e.g. \"0.7302918774\"\n        self.current_input, self.next_input = self.select_random_inputs(self.next_input)",
      "why": [
        "Rising-edge interrupts on pull-up inputs instead of polling, so a strike is caught even while LED animations run on other threads.",
        "Debounce is a per-pin lock that a 100 ms timer releases; extra edges from the ball bounce are dropped before any code runs.",
        "Only the wall that counts publishes: the lit target in Core OG, the mirrored wall in Mirror modes (where the lit wall itself is ignored). Wrong walls are filtered on the Pi, so the kiosk never needs the wall layout.",
        "The message value is a random float: the message itself is the event, and the value only keeps each one distinct."
      ],
      "files": [
        "pod-game/game_modes/classic/classic_controller.py:151",
        "pod-game/SWT_Input.py:27",
        "pod-game/utils/pin_constants.py:5"
      ]
    },
    {
      "id": "count-hit",
      "title": "Kiosk counts the point",
      "node": "kiosk",
      "edge": "redis>kiosk",
      "pod": "count",
      "plain": "The kiosk turns each hit into a point, starts the clock on the first one, and doubles points late in Clutch.",
      "transport": "Redis Pub/Sub (local)",
      "address": "hit_events",
      "payloadLang": "dart",
      "payload": "_debouncer(() {  // 50 ms trailing debounce\n  if (ref.read(currentGameStateProvider) != GameState.running) {\n    ref.read(currentGameStateProvider.notifier).changeGameState(GameState.running);\n  }\n  switch (timerState) {\n    case GameTimerState.thirty: thirtyInterval += 1;\n    case GameTimerState.sixty:  sixtyInterval += 1;\n    case GameTimerState.ninety: ninetyInterval += isClutch ? 2 : 1;\n  }\n  redis.publish(\"score_updates\", scoreToPublish.toString());\n});",
      "why": [
        "A second 50 ms debounce on the kiosk collapses any burst that got past the Pi into one point.",
        "The countdown starts on the first hit, not on start, so walking up to the ball does not cost the player time.",
        "Score is kept in three 30 s buckets; Clutch adds 2 per hit in the last bucket, which is the whole x2 rule.",
        "The kiosk owns the score. The Pi only reports hits, so scoring rules change without touching the Pi."
      ],
      "files": [
        "kiosk-app/lib/view_models/gameplay_provider/gameplay_provider.dart:222",
        "kiosk-app/lib/core/utils/utils.dart:71",
        "kiosk-app/lib/view_models/gameplay_provider/gameplay_provider.dart:296"
      ]
    },
    {
      "id": "scoreboard-update",
      "title": "Scoreboard shows live score",
      "node": "scoreboard",
      "edge": "redis>scoreboard",
      "pod": "scoreboard",
      "plain": "The big screen above the pod updates the score and the clock the moment the kiosk publishes them.",
      "transport": "Redis Pub/Sub (local)",
      "address": "score_updates",
      "payloadLang": "text",
      "payload": "commands  \"100\"  -> title SCORE, score 00\nscore_updates     \"17\"   -> SCORE 17\ntimer_updates     \"41\"   -> :41\ntimer_updates     \"9\"    -> :09 (last 10 s highlighted)\ncommands  \"200\"  -> title FINAL SCORE",
      "why": [
        "The scoreboard is a pure subscriber with no game logic, so it can restart mid-game and catch up on the next message.",
        "It subscribes to seven channels in one PubSub and switches on channel name, so new screens are one more case.",
        "For 1-pod and Battle Royale the kiosk adds the equaliser handicap before publishing, so the board always shows the adjusted score."
      ],
      "files": [
        "display-app/lib/core/providers/redis_provider/redis_provider.dart:49",
        "display-app/lib/core/providers/redis_provider/redis_provider.dart:146"
      ]
    },
    {
      "id": "end-game",
      "title": "Clock hits zero",
      "node": "pi",
      "edge": "redis>pi",
      "pod": "buzzer",
      "plain": "When time runs out, the kiosk tells the pod to stop and the walls play a circle light show for 10 seconds.",
      "transport": "Redis Pub/Sub (local)",
      "address": "commands",
      "payloadLang": "dart",
      "payload": "if (durationLeft == 0) _endGameCallback(gameConfig, location);\n\n// _endGameCallback\nunawaited(redis.publish(\"commands\", \"200\"));  // Pi: stop + LED circle\nawait Future.delayed(Duration(milliseconds: 350));  // gameBackgroundTimeInMs\n_debouncer.flush();   // count a hit still waiting in the debouncer\n_debouncer.cancel();\n_scoreHitChannel?.cancel();",
      "why": [
        "The kiosk owns the only clock (a 1 s periodic ticker) and tells the Pi to stop, so there are never two timers drifting apart.",
        "After 200 the kiosk keeps listening for 350 ms, flushes the debouncer, then cancels the channel: a last-instant hit counts and nothing leaks into the next game.",
        "On 200 the Pi runs END_OF_GAME_DISPLAY, a circle animation across all 240 LEDs for ENDGAME_ANIMATION_DELAY = 10 s."
      ],
      "files": [
        "kiosk-app/lib/view_models/gameplay_provider/gameplay_provider.dart:356",
        "pod-game/game_animations.py:123",
        "pod-game/game_modes/classic/classic_controller.py:255"
      ]
    },
    {
      "id": "post-score",
      "title": "Kiosk posts the score",
      "node": "api",
      "edge": "kiosk>api",
      "pod": "post",
      "plain": "The kiosk sends the final score to the cloud backend, which answers with any instant rewards to celebrate.",
      "transport": "HTTPS + JWT (Retrofit/Dio)",
      "address": "POST /v1/players/{playerId}/scores",
      "payloadLang": "http",
      "payload": "POST https://api.example.com/v1/players/1001/scores\nAuthorization: Bearer <access token>\n\n{\"location_id\": 3, \"game_mode_id\": 1, \"score\": 64, \"game_style\": \"classic\"}\n\n201 Created\n{\"createdScore\": {\"id\": 48213, \"score\": 64, \"season\": 3, ...},\n \"singleGameReward\": {\"total_xp_earned\": 11, \"animation\": \"great_game\", ...}}",
      "why": [
        "Classic games with a random sequence and Weekly Pattern games with a fixed sequence go to this endpoint; practice sequences are never stored. 1-Pod and Battle Royale scores use their own batch and room endpoints.",
        "The post only happens when the kiosk is online. Offline, the game still plays with a dummy player and the score is not saved (Battle Royale is the one exception).",
        "Retrofit generates a typed client and a Dio interceptor adds the Bearer token and refreshes it on expiry.",
        "The response already carries the high score and single-game reward, so the kiosk can celebrate without a second call."
      ],
      "files": [
        "kiosk-app/lib/view_models/gameplay_provider/gameplay_provider.dart:391",
        "kiosk-app/lib/core/request_models/player_score_request.dart:16",
        "backend/src/modules/player/controllers/player.controller.ts:245"
      ]
    },
    {
      "id": "score-transaction",
      "title": "Score saved in one transaction",
      "node": "db",
      "edge": "api>db",
      "pod": "transaction",
      "plain": "The backend saves the score and everything the player must see right away in a single all-or-nothing database write.",
      "transport": "SQL transaction (Knex)",
      "address": "soccer_game_score",
      "payloadLang": "ts",
      "payload": "const result = await this.knex.transaction(async trx => {\n  await trx('player').where('id', player_id).increment('game_count', 1)\n  const [createdScore] = await trx('soccer_game_score').insert({ ... }).returning('*')\n  const qualifiedRewards = evaluateSingleGameRewards(configs, { score, prevHighScore, thirdBestScore, ... })\n  await this.levelUpService.recordXp(trx, player_id, season, totalXp, XpSource.SingleGameReward)\n  await trx('player_transaction').insert({ reward_name: 'single_game_reward', xp_earned: totalXp, ... })\n  if (createdScore.score > prevHighScore) await trx('player_achievement').insert({ ... })\n  await trx('daily_play_log').insert({ player_id, play_date }).onConflict(['player_id', 'play_date']).ignore()\n})\nawait this.scoreEventsQueueService.addScoreEventJob({ ... })  // after commit",
      "why": [
        "Everything the kiosk shows right away (score row, game count, mode unlock, single-game XP, personal high score) commits together or not at all.",
        "Database triggers on soccer_game_score fill player age, season and year, and recompute player_metadata.total_points_all, so every write path gets them for free.",
        "recordXp takes pg_advisory_xact_lock(playerId) before touching player_metadata, season_stats and player_xp, which serializes XP writes per player and avoids upsert deadlocks.",
        "daily_play_log uses onConflict().ignore(), so ten games in a day still log one play day."
      ],
      "files": [
        "backend/src/modules/player/repositories/player.repository.ts:568",
        "backend/src/modules/player/services/level-up.service.ts:38",
        "backend/src/utils/single-game-reward.utils.ts:23"
      ]
    },
    {
      "id": "celebrate",
      "title": "Scoreboard celebrates the game",
      "node": "scoreboard",
      "edge": "redis>scoreboard",
      "pod": "celebrate",
      "plain": "If the game was a personal best or a strong game, the scoreboard plays a celebration with the score and XP earned.",
      "transport": "Redis Pub/Sub (local)",
      "address": "commands",
      "payloadLang": "text",
      "payload": "# new personal best\nPUBLISH commands 1200\n\n# otherwise, good or great game\nPUBLISH commands 1300#DELIM#{\"animation\":\"great_game\",\"score\":64,\"xp\":10,\"game_mode\":\"Core OG\",\"game_style\":\"classic\"}",
      "why": [
        "A high score wins: the kiosk sends 1200 when the response has personalHighScoreAchievement, and only otherwise sends 1300 with a payload.",
        "The payload rides after #DELIM# on commands; the Pi skips any message containing #DELIM# before int() so it cannot crash on it.",
        "XP on screen sums only rewards that have an animation, so the 1 XP for playing any game is left out (great game shows 5 + 5 = 10)."
      ],
      "files": [
        "kiosk-app/lib/view_models/gameplay_provider/gameplay_provider.dart:564",
        "display-app/lib/core/providers/redis_provider/redis_provider.dart:92",
        "pod-game/controllers/redis_controller.py:61"
      ]
    },
    {
      "id": "reward-job",
      "title": "Background job grants rewards",
      "node": "queue",
      "edge": "api>queue",
      "pod": "rewards",
      "plain": "Slower rewards like missions, badges and score levels are handed to a background worker so the kiosk is not kept waiting.",
      "transport": "BullMQ job",
      "address": "scoreEvents / processScore",
      "payloadLang": "json",
      "payload": "{\n  \"player_id\": 1001,\n  \"score_id\": 48213,\n  \"score\": 64,\n  \"game_mode_id\": 1,\n  \"game_style\": \"classic\",\n  \"prev_high_score\": 71,\n  \"new_game_count\": 214,\n  \"season\": 3\n}",
      "why": [
        "The job is enqueued only after the transaction commits, so the worker never sees a score that could still roll back.",
        "The worker (concurrency 5) runs score level and total points achievements, badges, daily, weekly and seasonal missions, then the level-up check.",
        "withDeadlockRetry reruns the whole job on Postgres error 40P01, up to 3 attempts with 50 ms x attempt plus random jitter.",
        "Because a rerun replays every step, each reward step carries its own guard (see the three idempotency layers)."
      ],
      "files": [
        "backend/src/modules/queue/score-event-queue.service.ts:123",
        "backend/src/modules/queue/score-event-queue.service.ts:146",
        "backend/src/modules/queue/score-event-queue.service.ts:168"
      ]
    },
    {
      "id": "level-up",
      "title": "Level up and notify",
      "node": "notify",
      "edge": "queue>notify",
      "pod": "notify",
      "plain": "If the player crossed an XP level, they get coins and a notification row that the kiosk shows them at their next tap-in.",
      "transport": "SQL transaction (Knex)",
      "address": "player_notification",
      "payloadLang": "sql",
      "payload": "SELECT pg_advisory_xact_lock(1001);\nSELECT * FROM season_stats WHERE player_id = 1001 AND season = 3 FOR UPDATE;\nINSERT INTO level_reward_log (player_id, level_config_id, season)\n  VALUES (1001, 7, 3) ON CONFLICT (player_id, level_config_id, season) DO NOTHING RETURNING id;\nINSERT INTO player_transaction (player_id, transaction_type, free_live_credits, reward_name)\n  VALUES (1001, 'add', 2, 'level_up');\nINSERT INTO player_notification (player_id, notification_type, popup_type, metadata)\n  VALUES (1001, 'level_up', 'tap', '{\"level_key\":\"academy_player_1\",\"cc_reward\":2,\"season\":3}');",
      "why": [
        "checkLevelUp runs in its own transaction, takes the same per-player advisory lock, then locks the season row with FOR UPDATE.",
        "Each crossed level is claimed with an insert into level_reward_log; coins and the notification are written only if that insert returned a row.",
        "One notification per level crossed, so a big XP jump still shows every level the player passed."
      ],
      "files": [
        "backend/src/modules/player/services/level-up.service.ts:73",
        "backend/src/modules/player/services/level-up.service.ts:115",
        "backend/src/database/migrations/20260525063115_create_level_up_tables.js:42"
      ]
    },
    {
      "id": "next-player",
      "title": "Kiosk shows rewards, next game",
      "node": "kiosk",
      "edge": "api>kiosk",
      "pod": "next",
      "plain": "The player is signed out and the pod moves on. Mission and level-up pop-ups appear the next time that player taps in; a player already queued gets their own pop-ups fetched now.",
      "transport": "HTTPS + JWT (Retrofit/Dio)",
      "address": "GET /v1/players/{playerId}/notifications",
      "payloadLang": "http",
      "payload": "GET https://api.example.com/v1/players/1001/notifications?new_notifications=true\n\n200 OK\n[{\"id\": 5531, \"notification_type\": \"level_up\", \"popup_type\": \"tap\",\n  \"metadata\": {\"level_key\": \"academy_player_1\", \"cc_reward\": 2, \"season\": 3}}]\n\nPATCH https://api.example.com/v1/players/1001/notifications   (dismiss)",
      "why": [
        "Notifications are pulled, not pushed: the kiosk fetches them for whoever is logged in or queued, and only shows them while no game is running. With nobody logged in, nothing is fetched.",
        "Dismiss is optimistic: the popup is removed locally first, then a PATCH tells the server.",
        "The kiosk moves to end 10 s after the score POST returns (after the 350 ms end window); 2 s later it starts the next queued player, unless a new high score asks for a manual start."
      ],
      "files": [
        "kiosk-app/lib/view_models/player_notifications_provider/player_notifications_provider.dart:15",
        "kiosk-app/lib/view_models/gameplay_provider/game_state_provider.dart:120",
        "kiosk-app/lib/core/repository/retrofit/api_constants.dart:26"
      ]
    }
  ],
  "singleGameRewards": [
    {
      "key": "play_any_game",
      "condition": "Any classic game. The config excludes offence vs defence, but the kiosk posts those games as classic, so in practice they earn it too. Weekly Pattern games get no single-game rewards.",
      "xp": 1,
      "animation": null,
      "minScore": null,
      "needsHighScore": false,
      "minGames": 1
    },
    {
      "key": "score_y",
      "condition": "Good Game: score at least 80% of the player's 3rd best score in this mode (needs 3 games, this one included)",
      "xp": 5,
      "animation": "good_game",
      "minScore": null,
      "needsHighScore": false,
      "thresholdPct": 80,
      "minGames": 3
    },
    {
      "key": "score_x",
      "condition": "Great Game: score at least 90% of the player's 3rd best score in this mode (needs 3 games, this one included)",
      "xp": 5,
      "animation": "great_game",
      "minScore": null,
      "needsHighScore": false,
      "thresholdPct": 90,
      "minGames": 3
    },
    {
      "key": "new_high_score",
      "condition": "Beat the previous best in this mode, after at least 10 games in the mode",
      "xp": 15,
      "animation": "high_score",
      "minScore": null,
      "needsHighScore": true,
      "minGames": 10
    }
  ],
  "levels": [
    {
      "level": 1,
      "name": "Prospect 1",
      "xp": 0,
      "coins": 0
    },
    {
      "level": 2,
      "name": "Prospect 2",
      "xp": 50,
      "coins": 1
    },
    {
      "level": 3,
      "name": "Prospect 3",
      "xp": 100,
      "coins": 1
    },
    {
      "level": 4,
      "name": "Phenom 1",
      "xp": 200,
      "coins": 1
    },
    {
      "level": 5,
      "name": "Phenom 2",
      "xp": 300,
      "coins": 1
    },
    {
      "level": 6,
      "name": "Phenom 3",
      "xp": 400,
      "coins": 1
    },
    {
      "level": 7,
      "name": "Academy Player 1",
      "xp": 550,
      "coins": 2
    },
    {
      "level": 8,
      "name": "Academy Player 2",
      "xp": 700,
      "coins": 2
    },
    {
      "level": 9,
      "name": "Academy Player 3",
      "xp": 850,
      "coins": 2
    },
    {
      "level": 10,
      "name": "First Team 1",
      "xp": 1050,
      "coins": 2
    },
    {
      "level": 11,
      "name": "First Team 2",
      "xp": 1250,
      "coins": 2
    },
    {
      "level": 12,
      "name": "First Team 3",
      "xp": 1450,
      "coins": 2
    },
    {
      "level": 13,
      "name": "Starting XI 1",
      "xp": 1700,
      "coins": 3
    },
    {
      "level": 14,
      "name": "Starting XI 2",
      "xp": 1950,
      "coins": 3
    },
    {
      "level": 15,
      "name": "Starting XI 3",
      "xp": 2200,
      "coins": 3
    },
    {
      "level": 16,
      "name": "Team Captain 1",
      "xp": 2500,
      "coins": 3
    },
    {
      "level": 17,
      "name": "Team Captain 2",
      "xp": 2800,
      "coins": 3
    },
    {
      "level": 18,
      "name": "Team Captain 3",
      "xp": 3100,
      "coins": 3
    },
    {
      "level": 19,
      "name": "Club Legend 1",
      "xp": 3450,
      "coins": 4
    },
    {
      "level": 20,
      "name": "Club Legend 2",
      "xp": 3800,
      "coins": 4
    },
    {
      "level": 21,
      "name": "Club Legend 3",
      "xp": 4150,
      "coins": 4
    },
    {
      "level": 22,
      "name": "Ballon d'Or 1",
      "xp": 4550,
      "coins": 4
    },
    {
      "level": 23,
      "name": "Ballon d'Or 2",
      "xp": 4950,
      "coins": 5
    },
    {
      "level": 24,
      "name": "Ballon d'Or 3",
      "xp": 5350,
      "coins": 6
    },
    {
      "level": 25,
      "name": "GOAT",
      "xp": 5850,
      "coins": 10
    }
  ],
  "xpSources": [
    {
      "source": "single_game_reward",
      "detail": "Written in the score transaction: 1 for any game, +5 good game, +5 great game, +15 new high score. They stack."
    },
    {
      "source": "daily_mission",
      "detail": "Completion tiers: 1, 2, 3 and 5 missions done in a day pay 5, 10, 15 and 20 XP."
    },
    {
      "source": "weekly_mission",
      "detail": "Completion tiers: 1, 2, 3, 5 and 7 missions done in a week pay 10, 20, 30, 40 and 50 XP."
    },
    {
      "source": "seasonal_mission",
      "detail": "Threshold ladders, e.g. Play Any Game pays 10 XP at 10 games and 25 XP at 25, then XP up to a 150 cap."
    },
    {
      "source": "weekly_pattern",
      "detail": "Weekly Pattern leaderboard rank rewards, paid by a Monday 00:05 Denver cron."
    }
  ],
  "missions": {
    "daily": "Seven daily missions (for example Play 12 Games, Score X points or higher 5x in Core OG, Play Rotating Alternate Game Mode) per Denver calendar day, active from a player's 6th lifetime game. Completing 1 to 7 missions pays 5 XP, 10 XP, 15 XP, 1 coin, 20 XP, 1 coin, 1 coin.",
    "weekly": "Eight weekly missions (for example Play 5 Ranked Battles, Beat High Score in Any Game Mode, Play 2 Days in a Row) that reset Monday in Denver time. Completing 1 to 8 pays 10 XP, 20 XP, 30 XP, 1 coin, 40 XP, 1 coin, 50 XP, 2 coins.",
    "seasonal": "Eight seasonal missions track season counters: games played, total points, Weekly Pattern plays, Top 10 in age group, ranked battles played and won, non Core OG games, and days played. Each has a threshold ladder; Play Any Game pays at 10, 25, then every 25 games up to 5,000, with coins on multiples of 50."
  },
  "seasons": "A season is one calendar quarter in America/Denver time: season = (year - 2026) * 4 + (quarter - 1), so Q1 2026 is season 0. A database trigger stamps season and year on every score row, and the backend uses the same formula. Each new season starts fresh seasonal XP (season_stats.total_xp_season), level (back to Prospect 1), seasonal missions and season counters; lifetime total XP and total points carry over. Battle season leaderboard rewards are paid at 00:05 on Jan 1, Apr 1, Jul 1 and Oct 1.",
  "leaderboards": [
    "High score: top 15 by default, filter by location, game mode, game style, gender, club, age range or birth year (GET /v1/leaderboard/public)",
    "Total points across all games (GET /v1/leaderboard/total-points)",
    "Battle mode (Battle Royale) by season (GET /v1/leaderboard/battle-mode)",
    "Weekly Pattern per week, with rank rewards paid every Monday 00:05 Denver (GET /v1/leaderboard/weekly-pattern/{playerId})",
    "Logged-in views that also show the player's own rank (GET /v1/leaderboard/{playerId} and /v1/leaderboard/{playerId}/total-scores)"
  ],
  "idempotency": [
    {
      "layer": "App-level gating",
      "plain": "Before writing a reward, the code checks whether it already wrote it, and per-player locks stop two writers racing.",
      "how": "achievementExists(score_id, type) before inserting a score level or total points achievement; alreadyCompletedIds so a mission is announced once; pg_advisory_xact_lock(playerId) around XP writes and level checks.",
      "example": "Replaying score 48213 finds its high_score_point_level row and skips the insert and the coin transaction.",
      "files": [
        "backend/src/modules/queue/score-event-queue.service.ts:135",
        "backend/src/modules/player/services/daily-mission.service.ts:77",
        "backend/src/modules/player/services/level-up.service.ts:38"
      ]
    },
    {
      "layer": "High-water marks",
      "plain": "Each reward ladder remembers the highest step already paid and only pays steps above it.",
      "how": "daily_mission_rewards.missions_completed and weekly_mission_rewards.missions_completed per day or week; seasonal_missions.last_completed_threshold_id per mission and season.",
      "example": "Already paid for 3 daily missions and 3 are complete: totalCompleted <= previouslyRewarded, so nothing is paid.",
      "files": [
        "backend/src/modules/player/services/daily-mission.service.ts:188",
        "backend/src/modules/player/services/weekly-mission.service.ts:228",
        "backend/src/modules/player/services/seasonal-mission.service.ts:161"
      ]
    },
    {
      "layer": "Database unique constraints",
      "plain": "The database itself refuses a second copy of a one-time reward, and the code treats that as a quiet no-op.",
      "how": "Unique (player_id, level_config_id, season) on level_reward_log with onConflict().ignore(); coins and notification only if the insert returned a row. The same pattern guards daily_play_log and the mission row tables.",
      "example": "A second level check for Academy Player 1 in season 3 inserts nothing, so no second coin or notification.",
      "files": [
        "backend/src/modules/player/services/level-up.service.ts:115",
        "backend/src/database/migrations/20260525063115_create_level_up_tables.js:42",
        "backend/src/modules/player/repositories/player.repository.ts:752"
      ]
    }
  ],
  "replayDemo": [
    {
      "layer": "Queue intake",
      "check": "queue.add('processScore', data) with no jobId",
      "result": "BullMQ accepts the second job for 48213 as new; nothing stops it at the queue."
    },
    {
      "layer": "Score transaction",
      "check": "Personal high score and single-game XP live in the POST transaction, not the job",
      "result": "Untouched by a job replay."
    },
    {
      "layer": "Score level achievement",
      "check": "achievementExists(48213, 'high_score_point_level')",
      "result": "Row found, so no second achievement and no second coin transaction."
    },
    {
      "layer": "Total points achievement",
      "check": "achievementExists(48213, 'total_points_level')",
      "result": "Holds only if the first run already wrote the row. The level window is computed from the live total_points_all, so a late or out-of-order run (concurrency 5) can cross a level under a different score_id and pay it twice."
    },
    {
      "layer": "Badge",
      "check": "evaluateBadge sets the badge from total points",
      "result": "Same badge written again; it is a set, not an add, so nothing changes."
    },
    {
      "layer": "Daily mission progress",
      "check": "No per-score guard",
      "result": "Play Games, Total Points and Score X counters advance a second time."
    },
    {
      "layer": "Daily mission rewards",
      "check": "totalCompleted <= daily_mission_rewards.missions_completed",
      "result": "Tiers already paid are skipped; a new tier is paid only if the double-counted progress completed another mission."
    },
    {
      "layer": "Weekly missions",
      "check": "progress++ on open missions; weekly_mission_rewards.missions_completed",
      "result": "Same as daily: progress can double count, paid tiers are not paid again."
    },
    {
      "layer": "Season counters",
      "check": "updateSeasonStats adds 1 game and 64 points again",
      "result": "games_played and total_points double count; days_played is recounted from daily_play_log and stays correct."
    },
    {
      "layer": "Seasonal rewards",
      "check": "threshold id <= last_completed_threshold_id",
      "result": "Paid thresholds are skipped; a new one pays only if an inflated counter crosses it."
    },
    {
      "layer": "Level up",
      "check": "Advisory lock, then insert into level_reward_log with onConflict().ignore()",
      "result": "No new rows, coins or level_up notifications, unless replayed mission XP pushed the player past a new level."
    }
  ],
  "improvements": [
    {
      "title": "Idempotency key on POST /scores",
      "detail": "There is no retry today, so a timeout after the server commits loses the celebration on the kiosk. Retrying safely needs an idempotency key first: send a client UUID with each game, store it under a unique constraint, and return the first response on a repeat."
    },
    {
      "title": "Deterministic BullMQ jobId",
      "detail": "Enqueue with jobId score-{score_id} so a duplicate enqueue is dropped, and record processed score ids (unique score_id) so a replay after completion is also a no-op."
    },
    {
      "title": "Per-score guard for mission counters",
      "detail": "Daily and weekly progress and season_stats counters are increments, so a replay double counts. Apply them once per score_id, or recompute them from soccer_game_score."
    },
    {
      "title": "Unique constraint for achievements",
      "detail": "achievementExists is check-then-insert outside a transaction. Add unique (score_id, achievement_type) on player_achievement, use onConflict().ignore(), and write the achievement and its player_transaction in one transaction."
    }
  ],
  "offlineHistory": "I built an offline-first score sync engine for kiosk outages. The client later asked for it to be retired after it caused score discrepancies, so it is no longer in the kiosk code. What remains: offline mode runs games with a dummy player and does not save scores, and Battle Royale saves a failed score as offline_battle_scores_{roomId} and re-posts it every 3 s until the connection returns."
};
