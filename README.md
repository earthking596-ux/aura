# AURA.IO — Positive Aura vs Negative Aura Cosmic Team Survival

AURA.IO is a top-down 2D cosmic energy survival game combining the growth and coiling mechanics of *Slither.io* with the multi-round team structure of *Clash Squad*, built from scratch with **HTML5 Canvas, TypeScript, Node.js, Express, and Socket.IO** (no external game engine).

## Core Features

1. **Cosmic Energy Organisms**:
   - Every player starts as **1 tiny glowing dot** (minimum mass `10`) and grows smoothly by collecting small, medium, large, and bonus energy orbs.
   - **Positive Aura (Blue Team)**: Electric cyan & bright blue outer aura with customizable inner core color and 3 optional Special Powers:
     - **[Q] Energy Shield**: 3.0s invulnerable core barrier.
     - **[E] Speed Dash**: Zero-mass-drain speed burst.
     - **[F] Energy Magnet**: Wide-radius cosmic energy magnet.
   - **Negative Aura (Purple Team)**: Violet & magenta outer aura with customizable inner core color and 3 optional Special Powers:
     - **[Q] Shockwave Push**: Radial repulsion blast that pushes nearby opponents back.
     - **[E] Slow Trap**: Deploys a gravitational slow anomaly at the tail.
     - **[F] Confuse Wave**: Speed burst and nearby enemy steering jammer.
2. **Custom Independent Team Sizes (6-Player Room Cap)**:
   - Independently select **1 to 5 players per team** (such as `1 vs 1`, `2 vs 2`, `3 vs 3`, `1 vs 5`, `2 vs 4`, `4 vs 2`) with a strict **maximum of 6 players per room** for fast, lag-free performance.
   - Configurable round counts (`1 Round Match`, `First to Win 2, 3, or 4 Rounds`) and border rules (`Eliminate`, `Bounce`, or `Lose Size on Border`).
3. **Real-Time Socket.IO Multiplayer & Private Rooms**:
   - Server-authoritative 30Hz physics, collision validation, and room management in `server.ts`.
   - Create a 6-character Private Room code in one browser tab and join with the code in another browser window to battle in real time.

## Setup & Commands

```bash
# 1. Install dependencies
npm install

# 2. Run unit tests for game rules, collisions, and AI
npx tsx --test src/game/rules.test.ts

# 3. Start full-stack Express + Socket.IO + Vite server on port 3000
npm run dev

# 4. Production build & start
npm run build
npm start
```

## Testing Multiplayer Across Multiple Browser Windows

1. Open `http://localhost:3000` in **Window 1**, select the **Play with Friends** tab, configure your team sizes, and click **Create Room**.
2. Copy the 6-character room code displayed in the active room lobby.
3. Open `http://localhost:3000` in **Window 2**, select the **Play with Friends** tab, enter the 6-character code, and click **Join Room**.
4. Choose your cosmic team (`Positive Aura` or `Negative Aura`) and click **Start Room Match** to battle in real time.
