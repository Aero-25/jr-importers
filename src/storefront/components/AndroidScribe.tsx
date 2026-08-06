import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { layOut } from './strokeFont';

/* ── Staging ───────────────────────────────────────────────────────────────
   World units. The character is ~1.7 tall, so everything is sized against a
   figure a little under two units.                                          */

const TEXT = 'JR Importers';
const EM = 0.5; // glyph scale
const TEXT_X = -1.95; // left edge of the writing
const TEXT_Y = 0.62; // baseline
const HAND_LEAD = 0.78; // how far ahead of the body the writing hand reaches

const WALK_IN_S = 2.1;
const WRITE_S = 4.6;
const EXIT_S = 1.7;

type Phase = 'walkIn' | 'write' | 'exit' | 'idle';

/**
 * The hero performance: an Android walks in, writes "JR Importers" by hand,
 * walks aside and folds its arms.
 *
 * The writing is genuine stroke animation, not a fade — each letter is the
 * centre-line of a pen movement (see strokeFont.ts), revealed at constant
 * *distance* per second so a dense curve like the `o` writes at the same speed
 * as a straight stem. The hand is placed on the live pen tip every frame, so
 * the arm follows the ink rather than the two being animated separately and
 * drifting apart.
 *
 * Costs are gated hard: nothing loads until it scrolls into view, and a
 * reduced-motion or low-memory visitor gets the finished tableau with no
 * animation loop at all.
 */
export function AndroidScribe({ className }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (connection?.saveData) return;
    if (typeof memory === 'number' && memory <= 2) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(mount);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let teardown: (() => void) | undefined;

    void (async () => {
      const THREE = await import('three');
      if (disposed || !mountRef.current) return;

      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      let width = mount.clientWidth || 560;
      let height = mount.clientHeight || 460;

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        return; // No WebGL — the hero reads fine without it.
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
      camera.position.set(0, 0.75, 9.6);
      camera.lookAt(0, 0.7, 0);

      scene.add(new THREE.AmbientLight(0xd8f0c0, 0.62));
      const key = new THREE.DirectionalLight(0xffffff, 1.35);
      key.position.set(4, 7, 6);
      const rim = new THREE.PointLight(0xa3e635, 2.4, 40);
      rim.position.set(-5, 2.5, 3);
      const fill = new THREE.PointLight(0x2c57f2, 1.1, 40);
      fill.position.set(5, -1, 4);
      scene.add(key, rim, fill);

      /* Everything disposable is tracked so unmount actually frees it. */
      const geometries: import('three').BufferGeometry[] = [];
      const materials: import('three').Material[] = [];
      const keep = <T extends import('three').BufferGeometry>(g: T) => {
        geometries.push(g);
        return g;
      };
      const keepMat = <T extends import('three').Material>(m: T) => {
        materials.push(m);
        return m;
      };

      const green = keepMat(
        new THREE.MeshStandardMaterial({
          color: 0x8fd83f,
          roughness: 0.38,
          metalness: 0.12,
          emissive: 0x24400f,
          emissiveIntensity: 0.42,
        }),
      );
      const white = keepMat(
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }),
      );
      const dark = keepMat(new THREE.MeshStandardMaterial({ color: 0x0b1622, roughness: 0.4 }));

      /* ── The figure ──────────────────────────────────────────────────────
         Built as a joint hierarchy rather than loose meshes: rotating a
         shoulder has to carry the forearm with it, which is what makes the
         arms fold convincingly instead of intersecting the chest.           */

      const bot = new THREE.Group();
      const body = new THREE.Group(); // bobs; limbs hang off it
      bot.add(body);

      const head = new THREE.Group();
      head.position.y = 1.16;
      head.add(new THREE.Mesh(keep(new THREE.SphereGeometry(0.42, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2)), green));

      const eyeGeo = keep(new THREE.SphereGeometry(0.055, 18, 18));
      const eyeL = new THREE.Mesh(eyeGeo, white);
      eyeL.position.set(-0.15, 0.17, 0.37);
      const eyeR = new THREE.Mesh(eyeGeo, white);
      eyeR.position.set(0.15, 0.17, 0.37);
      const pupilGeo = keep(new THREE.SphereGeometry(0.026, 12, 12));
      const pupilL = new THREE.Mesh(pupilGeo, dark);
      pupilL.position.set(-0.15, 0.17, 0.415);
      const pupilR = new THREE.Mesh(pupilGeo, dark);
      pupilR.position.set(0.15, 0.17, 0.415);
      head.add(eyeL, eyeR, pupilL, pupilR);

      const antGeo = keep(new THREE.CylinderGeometry(0.017, 0.017, 0.34, 10));
      const antL = new THREE.Mesh(antGeo, green);
      antL.position.set(-0.24, 0.36, 0);
      antL.rotation.z = 0.55;
      const antR = new THREE.Mesh(antGeo, green);
      antR.position.set(0.24, 0.36, 0);
      antR.rotation.z = -0.55;
      head.add(antL, antR);
      body.add(head);

      const torso = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.42, 0.42, 0.72, 40)), green);
      torso.position.y = 0.7;
      const chest = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.42, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2)),
        green,
      );
      chest.position.y = 1.06;
      const hipCap = new THREE.Mesh(keep(new THREE.CircleGeometry(0.42, 40)), green);
      hipCap.rotation.x = -Math.PI / 2;
      hipCap.position.y = 0.34;
      body.add(torso, chest, hipCap);

      /** Shoulder → upper arm → elbow → forearm, so folding works. */
      function makeArm(side: -1 | 1) {
        const shoulder = new THREE.Group();
        shoulder.position.set(side * 0.53, 0.98, 0);

        const upper = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.11, 0.11, 0.42, 18)), green);
        upper.position.y = -0.21;
        shoulder.add(upper);

        const elbow = new THREE.Group();
        elbow.position.y = -0.42;
        shoulder.add(elbow);

        const fore = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 18)), green);
        fore.position.y = -0.2;
        const hand = new THREE.Mesh(keep(new THREE.SphereGeometry(0.115, 18, 18)), green);
        hand.position.y = -0.4;
        elbow.add(fore, hand);

        body.add(shoulder);
        return { shoulder, elbow, hand };
      }
      const armL = makeArm(-1);
      const armR = makeArm(1);

      function makeLeg(side: -1 | 1) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.17, 0.34, 0);

        const thigh = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 18)), green);
        thigh.position.y = -0.15;
        hip.add(thigh);

        const knee = new THREE.Group();
        knee.position.y = -0.3;
        hip.add(knee);

        const shin = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.115, 0.115, 0.28, 18)), green);
        shin.position.y = -0.14;
        const foot = new THREE.Mesh(keep(new THREE.SphereGeometry(0.125, 16, 16)), green);
        foot.position.y = -0.28;
        knee.add(shin, foot);

        body.add(hip);
        return { hip, knee };
      }
      const legL = makeLeg(-1);
      const legR = makeLeg(1);

      bot.scale.setScalar(0.86);
      scene.add(bot);

      // Contact shadow — sells the character standing on something.
      const shadow = new THREE.Mesh(
        keep(new THREE.CircleGeometry(0.5, 32)),
        keepMat(
          new THREE.MeshBasicMaterial({
            color: 0x0b2545,
            transparent: true,
            opacity: 0.16,
            depthWrite: false,
          }),
        ),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = -0.001;
      scene.add(shadow);

      /* ── The ink ─────────────────────────────────────────────────────────
         One tube per pen stroke. Revealing by index range walks the reveal
         along the tube, which is exactly the order the pen travels.         */

      const { strokes } = layOut(TEXT);
      const totalLength = strokes.reduce((n, s) => n + s.length, 0);

      const inkCore = keepMat(new THREE.MeshBasicMaterial({ color: 0x1a3f6b }));
      const inkGlow = keepMat(
        new THREE.MeshBasicMaterial({
          color: 0xa3e635,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );

      const inked = strokes.map((stroke) => {
        const curve = new THREE.CatmullRomCurve3(
          stroke.points.map(
            ([x, y]) => new THREE.Vector3(TEXT_X + x * EM, TEXT_Y + y * EM, 0),
          ),
        );
        const segments = Math.max(12, Math.round(stroke.length * 46));

        const core = new THREE.Mesh(keep(new THREE.TubeGeometry(curve, segments, 0.018, 6, false)), inkCore);
        const glow = new THREE.Mesh(keep(new THREE.TubeGeometry(curve, segments, 0.05, 6, false)), inkGlow);
        scene.add(core, glow);

        const indexCount = core.geometry.index?.count ?? 0;
        core.geometry.setDrawRange(0, still ? indexCount : 0);
        glow.geometry.setDrawRange(0, still ? indexCount : 0);

        return { curve, core, glow, indexCount, length: stroke.length };
      });

      /** World position of the pen after `drawn` em-units of travel. */
      const pen = new THREE.Vector3(TEXT_X, TEXT_Y, 0);
      function advanceInk(drawn: number) {
        let remaining = drawn;
        for (const s of inked) {
          if (remaining <= 0) {
            s.core.geometry.setDrawRange(0, 0);
            s.glow.geometry.setDrawRange(0, 0);
            continue;
          }
          const ratio = Math.min(remaining / s.length, 1);
          const count = Math.ceil(s.indexCount * ratio);
          s.core.geometry.setDrawRange(0, count);
          s.glow.geometry.setDrawRange(0, count);
          if (ratio < 1) {
            s.curve.getPointAt(ratio, pen);
            return;
          }
          s.curve.getPointAt(1, pen);
          remaining -= s.length;
        }
      }

      /* ── Poses ───────────────────────────────────────────────────────── */

      const resetLimbs = () => {
        armL.shoulder.rotation.set(0, 0, 0);
        armR.shoulder.rotation.set(0, 0, 0);
        armL.elbow.rotation.set(0, 0, 0);
        armR.elbow.rotation.set(0, 0, 0);
      };

      function poseWalk(t: number) {
        const swing = Math.sin(t * 7.6);
        legL.hip.rotation.x = swing * 0.62;
        legR.hip.rotation.x = -swing * 0.62;
        legL.knee.rotation.x = Math.max(0, -swing) * 0.72;
        legR.knee.rotation.x = Math.max(0, swing) * 0.72;
        armL.shoulder.rotation.x = -swing * 0.5;
        armR.shoulder.rotation.x = swing * 0.5;
        armL.elbow.rotation.x = 0.28;
        armR.elbow.rotation.x = 0.28;
        body.position.y = Math.abs(Math.cos(t * 7.6)) * 0.045;
        bot.rotation.z = swing * 0.02;
      }

      function poseStand() {
        legL.hip.rotation.x = 0;
        legR.hip.rotation.x = 0;
        legL.knee.rotation.x = 0;
        legR.knee.rotation.x = 0;
        bot.rotation.z = 0;
      }

      /**
       * Reaches the writing hand to the pen.
       *
       * Aimed with a quaternion rather than hand-rolled trig: the limb hangs
       * along -Y, so rotating that axis onto the shoulder→pen direction points
       * the whole arm at the target in one step, and stays correct wherever
       * the pen happens to be. Doing it with atan2 per axis is where the first
       * version went wrong and splayed the arm sideways.
       */
      const DOWN = new THREE.Vector3(0, -1, 0);
      const shoulderWorld = new THREE.Vector3();
      const aim = new THREE.Vector3();

      function poseWrite(target: import('three').Vector3) {
        bot.updateMatrixWorld();
        armR.shoulder.getWorldPosition(shoulderWorld);
        aim.copy(target).sub(shoulderWorld).normalize();

        armR.shoulder.quaternion.setFromUnitVectors(DOWN, aim);
        // A little bend keeps it from reading as a rigid pointer.
        armR.elbow.rotation.set(-0.22, 0, 0);

        // The other arm just hangs, slightly back.
        armL.shoulder.rotation.set(0.16, 0, 0.08);
        armL.elbow.rotation.set(0.3, 0, 0);
      }

      /**
       * The reference pose: forearms folded across the chest.
       *
       * Sign matters and is easy to get backwards. The limb hangs along -Y, so
       * a Z rotation maps it to (sin θ, −cos θ). Bringing the *right* arm
       * inward therefore needs a negative angle; positive swings it out into a
       * T-pose, which is exactly what the first attempt did.
       */
      function poseArmsCrossed(blend: number) {
        const b = Math.min(Math.max(blend, 0), 1);

        armR.shoulder.rotation.set(-0.34 * b, 0, -0.62 * b);
        armR.elbow.rotation.set(-1.42 * b, 0, -0.38 * b);

        armL.shoulder.rotation.set(-0.34 * b, 0, 0.62 * b);
        // Slightly deeper so one forearm sits in front of the other rather
        // than intersecting it.
        armL.elbow.rotation.set(-1.58 * b, 0, 0.38 * b);
        armL.elbow.position.z = 0.07 * b;
      }

      /* ── Phase machine ───────────────────────────────────────────────── */

      const START_X = -3.5;
      const WRITE_START_X = TEXT_X - HAND_LEAD + 0.3;
      const FINAL_X = 2.35;

      let phase: Phase = 'walkIn';
      let clock = 0;
      let drawn = 0;
      let crossBlend = 0;

      const pointer = { x: 0, y: 0 };
      const onPointer = (e: PointerEvent) => {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      };
      window.addEventListener('pointermove', onPointer, { passive: true });

      // Reduced motion: present the finished tableau, no loop, no gait.
      if (still) {
        phase = 'idle';
        drawn = totalLength;
        bot.position.x = FINAL_X;
        advanceInk(totalLength);
        poseStand();
        poseArmsCrossed(1);
        shadow.position.x = FINAL_X;
        renderer.render(scene, camera);
      }

      let raf = 0;
      let last = performance.now();

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        clock += dt;

        if (phase === 'walkIn') {
          const k = Math.min(clock / WALK_IN_S, 1);
          bot.position.x = START_X + (WRITE_START_X - START_X) * k;
          poseWalk(clock);
          if (k >= 1) {
            phase = 'write';
            clock = 0;
            resetLimbs();
          }
        } else if (phase === 'write') {
          const k = Math.min(clock / WRITE_S, 1);
          drawn = totalLength * k;
          advanceInk(drawn);
          // The body drifts along under the pen, so the reach stays plausible.
          bot.position.x = pen.x - HAND_LEAD;
          poseStand();
          poseWrite(pen);
          // A small settle so he is not rigid while writing.
          body.position.y = Math.sin(clock * 3.1) * 0.012;
          if (k >= 1) {
            phase = 'exit';
            clock = 0;
          }
        } else if (phase === 'exit') {
          const k = Math.min(clock / EXIT_S, 1);
          const from = pen.x - HAND_LEAD;
          bot.position.x = from + (FINAL_X - from) * k;
          poseWalk(clock);
          crossBlend = Math.max(0, (k - 0.55) / 0.45);
          poseArmsCrossed(crossBlend);
          if (k >= 1) {
            phase = 'idle';
            clock = 0;
            poseStand();
          }
        } else {
          crossBlend = Math.min(1, crossBlend + dt * 2);
          poseArmsCrossed(crossBlend);
          // Breathing, and the head tracks the cursor.
          body.position.y = Math.sin(clock * 1.7) * 0.022;
          head.rotation.y += (pointer.x * 0.42 - head.rotation.y) * 0.06;
          head.rotation.x += (pointer.y * 0.24 - head.rotation.x) * 0.06;
          bot.rotation.y += (pointer.x * 0.14 - bot.rotation.y) * 0.04;
        }

        shadow.position.x = bot.position.x;
        shadow.scale.setScalar(phase === 'idle' ? 1 : 0.94);
        renderer.render(scene, camera);
      };

      if (!still) {
        bot.position.x = START_X;
        raf = requestAnimationFrame(frame);
      }

      const onResize = () => {
        width = mount.clientWidth;
        height = mount.clientHeight;
        if (!width || !height) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        renderer.render(scene, camera);
      };
      window.addEventListener('resize', onResize);

      // An unseen animation loop is pure battery drain.
      const onVisibility = () => {
        if (document.hidden) cancelAnimationFrame(raf);
        else if (!still) {
          last = performance.now();
          raf = requestAnimationFrame(frame);
        }
      };
      document.addEventListener('visibilitychange', onVisibility);

      teardown = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', onPointer);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibility);
        geometries.forEach((g) => g.dispose());
        materials.forEach((m) => m.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      teardown?.();
    };
  }, [active]);

  return (
    <div
      ref={mountRef}
      aria-hidden
      className={cn(
        'h-[320px] w-full select-none sm:h-[400px] lg:h-[480px]',
        '[&>canvas]:block [&>canvas]:!h-full [&>canvas]:!w-full',
        className,
      )}
      style={{ filter: 'drop-shadow(0 24px 48px rgb(163 230 53 / 0.22))' }}
    />
  );
}
