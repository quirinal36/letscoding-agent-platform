---
name: lounge-deploy
description: Build and validate a static ZIP for manual Let's Coding Lounge upload. Use for requests to package or check a single HTML file, plain HTML/CSS/JavaScript site, Vite build, Next.js static export, or an existing ZIP/output folder for Lounge deployment. Also use for requested Let's Coding Lounge score/ranking SDK integration in a score-based game. Use when the user asks in Korean for a 라운지 작품용 ZIP, 정적 배포 검사, 작품 업로드 준비, 점수 등록, or 랭킹 연동.
---

# Lounge Deploy

Produce a locally built ZIP and a policy-matched report. Never claim that the
work was uploaded to Lounge.

## Required workflow

1. Call the Lounge Deploy MCP `get_policy` without a version before reading or
   changing the project. Record the returned policy ID, immutable version, and
   content hash. If the MCP connection or policy lookup fails, stop; never use a
   remembered, bundled, or stale policy to report success.
2. Inspect only the metadata and allowlisted configuration content needed by
   `analyze_project`. Do not send source files, `.env` values, credentials, ZIP
   bytes, or student information. Call `analyze_project` with the recorded
   policy version.
3. Treat server-only behavior, unsupported dynamic routes, or other analysis
   blockers as blockers. Do not replace real server behavior with fake static
   behavior. Apply only the smallest reversible changes needed for static
   output. When the user explicitly requests Lounge ranking integration, apply
   the ranking workflow below before building. Preserve existing code, tests,
   lint, and type checks; do not delete or rewrite the project wholesale.
4. Run the project's existing install, test, lint, typecheck, and build commands
   that are relevant and safe. Package only the contents of the analyzer-selected
   static output directory, not the source tree or an extra wrapper directory.
5. Serialize the exact returned policy object to a temporary JSON file outside
   the project. Run this Skill's bundled
   `scripts/validate-artifact.mjs --policy <temp-policy.json> --directory <output-dir>`.
   Fix failures with minimal changes. Do not override an error. A warning may be
   waived only when the current policy says it is waivable, the user explicitly
   confirms the waiver, and the user-facing reason is recorded.
6. Create the ZIP from the validated output directory contents. Immediately
   before final acceptance, call `get_policy` again without a version. If its
   version or content hash differs, replace the temporary policy, rerun
   `analyze_project`, apply any newly required minimal change, rebuild, rerun the
   local directory check, and recreate the ZIP after every output change. Use
   only results produced with the new policy.
7. Run the bundled validator against the final ZIP. Pass its manifest, metadata,
   local result, the policy version used for that local check, and any
   user-confirmed warning waiver to `validate_artifact`. If it returns
   `REVALIDATION_REQUIRED`, fetch that policy and repeat analysis, build,
   directory validation, ZIP creation, local ZIP validation, and server
   validation. Continue only when the final response is `PASS` for the active
   version.
8. Call `create_report` with the matching analysis and final validation results,
   changed files and reasons, commands in execution order, output directory,
   absolute ZIP path, verified features, external origins, and remaining
   limitations. Do not pass runtime environment variable names or values. Return
   its Korean Markdown report.

## Optional Lounge ranking integration

Use this workflow only when the user asks to add, enable, or prepare Lounge
score/ranking for a game. Do not add ranking behavior to an ordinary ZIP request
without that request.

1. Read the game before editing. Identify the real score value and every
   terminal game-over condition: for example, last life lost or time expired.
   Do not submit on a stage clear, round clear, pause, or any state where play
   can continue. If the game has no meaningful score or no terminal condition,
   make no ranking change and report that fact.
2. Add this exact SDK tag to the document `<head>` without replacing existing
   scripts:

   ```html
   <script src="https://lounge.letscoding.kr/sdk/letscoding-ranking.js"></script>
   ```

3. Add a `rankingStatus` element to the existing game-over/result UI. Its
   initial text must be empty. Do not create a new result screen or change game
   scoring, difficulty, lives, timers, progression, or other gameplay logic.
4. Add a small integration helper using a per-run `rankingSubmitted` flag. It
   must check `window.LetscodingRanking` before setting the flag, show that the
   SDK was not loaded when absent, floor the score and clamp it to an integer of
   at least zero, display a submitting message, call
   `LetscodingRanking.submitScore(safeScore)`, show the returned error message
   unchanged on failure, and reset the flag on failure so the game can retry.
   Reset the flag when a new game starts. A suitable shape is:

   ```js
   let rankingSubmitted = false;

   function setRankingStatus(message) {
     const element = document.getElementById("rankingStatus");
     if (element) element.textContent = message;
   }

   function submitRanking(score) {
     if (rankingSubmitted) return;
     if (!window.LetscodingRanking) {
       setRankingStatus(
         "랭킹 SDK가 로드되지 않았어요 (로컬 테스트 환경인가요?)",
       );
       return;
     }
     rankingSubmitted = true;
     setRankingStatus("랭킹 등록 중...");
     const safeScore = Math.max(0, Math.floor(score));
     LetscodingRanking.submitScore(safeScore)
       .then(() => setRankingStatus("🏆 랭킹에 등록되었어요!"))
       .catch((error) => {
         rankingSubmitted = false;
         setRankingStatus("랭킹 등록 실패: " + error.message);
       });
   }
   ```

5. Call `submitRanking(actualScore)` at every identified terminal condition.
   Preserve the API's original error message, including a login-required error;
   do not substitute a generic message. Treat the SDK origin as an external
   origin in the final report. The Plugin does not submit a score itself: the
   uploaded game does so later in the user's browser.
6. In the final report, state the chosen score variable, every terminal
   function/location where submission was added, the modified files, and any
   local-test limitation caused by the SDK not being present.

## Policy and safety boundaries

- Derive size limits, allowed extensions and names, path rules, framework
  settings, runtime environment guidance, warning behavior, and error meanings
  only from the current MCP policy and guide. Do not hardcode or guess them.
- Do not accept, package, transmit, or report a work's `.env`, runtime
  environment variable names, or values. A feature requiring a secret must use
  Lounge's authenticated server-side secret management; state it as a remaining
  limitation when that service is unavailable.
- Do not disable lint, type checking, tests, or security checks to obtain a pass.
- Do not remove unrelated files or perform destructive source-control commands.
- Do not upload, register, publish, or make the Lounge work public. The result is
  only a “Lounge upload ZIP build and validation completed” handoff for the user
  to upload manually.

## Failure handoff

On any MCP, build, analysis, local validation, final validation, or report
failure, report the stable error/finding codes, the failed step, safe remediation,
and any preserved output path. Never use completion language. Remove the
temporary policy file after the final report or failure handoff.
