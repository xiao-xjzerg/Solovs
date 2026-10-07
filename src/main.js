import { sceneConfig } from "./config/scene.js";
import { combatFeelConfig } from "./config/combatFeel.js";
import { loadGameImages, loadManifest } from "./loaders/assets.js";
import { loadBossConfig } from "./loaders/config.js";
import { loadTiledScene } from "./loaders/tiled.js";
import { createInput } from "./input/input.js";
import { Game } from "./logic/game.js";
import { Renderer } from "./render/renderer.js";
import { VfxSystem } from "./render/vfx.js";

const canvas = document.getElementById("game-canvas");
const statusChip = document.getElementById("status-chip");
const playerHpFill = document.getElementById("player-hp-fill");
const bossHpFill = document.getElementById("boss-hp-fill");
const slotQ = document.getElementById("slot-q");
const slotW = document.getElementById("slot-w");
const slotE = document.getElementById("slot-e");
const slotRoll = document.getElementById("slot-roll");
const pauseMenu = document.getElementById("pause-menu");
const backGameButton = document.getElementById("back-game");
const returnMenuButton = document.getElementById("return-menu");

function setStatus(text) {
  statusChip.textContent = text;
}

function setSlotCooldown(element, seconds) {
  element.classList.toggle("cooldown", seconds > 0.01);
  element.textContent = seconds > 0.01 ? seconds.toFixed(1) : element.dataset.label;
}

function updateHud(game, paused) {
  const playerRatio = Math.max(0, game.player.hp / game.player.maxHp);
  const bossRatio = game.primaryBoss
    ? Math.max(0, game.primaryBoss.hp / game.primaryBoss.maxHp)
    : 0;
  playerHpFill.style.transform = `scaleX(${playerRatio})`;
  bossHpFill.style.transform = `scaleX(${bossRatio})`;

  setSlotCooldown(slotQ, game.player.cooldowns.Q);
  setSlotCooldown(slotW, game.player.cooldowns.W);
  setSlotCooldown(slotE, game.player.cooldowns.E);
  setSlotCooldown(slotRoll, game.player.cooldowns.roll);

  if (game.outcome === "victory") setStatus("Victory");
  else if (game.outcome === "defeat") setStatus("Defeat");
  else if (paused) setStatus("Paused");
  else if (game.feedback.hitStopT > 0) setStatus("Hitstop");
  else if (game.player.notice) setStatus(game.player.notice);
  else setStatus(`${game.player.state} ${game.player.direction}`);
}

function initSlotLabels() {
  for (const element of [slotQ, slotW, slotE, slotRoll]) {
    element.dataset.label = element.textContent;
  }
}

function bindInput(game, renderer, controls) {
  return createInput(canvas, {
    screenToWorld: (x, y) => renderer.screenToWorld(x, y),
    onSecondary: point => {
      if (!controls.isPaused()) game.handleSecondary(point);
    },
    onPrimary: point => {
      if (!controls.isPaused()) game.handlePrimaryConfirm(point);
    },
    onKey: key => {
      if (key === "ESC") {
        controls.togglePause();
        return;
      }
      if (controls.isPaused()) return;
      if (key === "Q") game.basicAttack();
      if (key === "W") game.activateReservedSkill("W");
      if (key === "E") game.activateReservedSkill("E");
      if (key === "ROLL") game.roll();
    }
  });
}

async function bootstrap() {
  initSlotLabels();
  setStatus("Loading");

  const manifest = await loadManifest();
  const [scene, bossConfig] = await Promise.all([
    loadTiledScene(sceneConfig.mapPath),
    loadBossConfig(manifest)
  ]);
  const images = await loadGameImages(manifest, scene);
  const game = new Game({ manifest, scene, bossConfig });
  const renderer = new Renderer(canvas, scene, images, manifest, bossConfig);
  const vfx = new VfxSystem();
  let paused = false;
  const setPaused = value => {
    paused = value;
    pauseMenu.classList.toggle("hidden", !paused);
    pauseMenu.setAttribute("aria-hidden", paused ? "false" : "true");
    if (paused) backGameButton.focus();
    else canvas.focus?.();
  };
  const controls = {
    isPaused: () => paused,
    togglePause: () => setPaused(!paused),
    setPaused
  };
  const input = bindInput(game, renderer, controls);

  backGameButton.addEventListener("click", () => setPaused(false));
  const homeUrl = /^\/gamehub\/play\/solovs(?:\/|$)/.test(window.location.pathname)
    ? new URL("/gamehub/", window.location.href)
    : new URL("../", import.meta.url);
  returnMenuButton.addEventListener("click", () => {
    if (!game.outcome && !window.confirm("当前对局尚未结束，返回首页会结束本局。确定返回吗？")) return;
    window.location.assign(homeUrl.href);
  });

  window.__solovs = {
    game,
    renderer,
    vfx,
    input,
    controls,
    runSelfTests: () => game.runSelfTests()
  };

  const selfTest = game.runSelfTests();
  if (!selfTest.ok) {
    console.warn("Solovs self tests failed", selfTest.failures);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const events = paused ? [] : game.update(dt);
    for (const event of events) vfx.handleEvent(event);
    const motionScale =
      game.feedback.hitStopT > 0 ? combatFeelConfig.hitstop.vfxMotionScale : 1;
    if (!paused) vfx.update(dt, motionScale);
    renderer.render(game, vfx);
    updateHud(game, paused);

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

bootstrap().catch(error => {
  console.error(error);
  setStatus("Load failed");
});
