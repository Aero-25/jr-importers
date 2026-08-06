import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { layOut } from './strokeFont';

/* ── Staging ───────────────────────────────────────────────────────────────
   World units. The character is ~1.7 tall, so everything is sized against a
   figure a little under two units.                                          */

const TEXT = 'JR Importers';
const EM = 0.66; // glyph scale
const TEXT_X = -2.45; // left edge of the writing
const TEXT_Y = 0.86; // baseline
// He walks *ahead* of the nib, so the finished letters always trail behind him
// in clear space. Trailing the pen instead put his body straight over the words
// he had just written.
const BODY_LEAD = 0.88;

const WALK_IN_S = 2.1;
const WRITE_S = 4.6;
const EXIT_S = 1.7;

type Phase = 'wait' | 'walkIn' | 'write' | 'exit' | 'idle';

/** Beat before the first performance, so it does not race the page load. */
const LEAD_IN_S = 0.9;
/** How long the finished tableau holds before the whole thing runs again. */
const HOLD_S = 4.5;

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
      camera.position.set(0, 0.94, 6.9);
      camera.lookAt(0, 0.94, 0);

      scene.add(new THREE.AmbientLight(0xd8f0c0, 0.62));
      const key = new THREE.DirectionalLight(0xffffff, 1.7);
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
          color: 0x9fd23c,
          roughness: 0.22,
          metalness: 0.0,
          emissive: 0x24400f,
          emissiveIntensity: 0.42,
        }),
      );
      const white = keepMat(
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }),
      );
      const dark = keepMat(new THREE.MeshStandardMaterial({ color: 0x0b1622, roughness: 0.4 }));

      /* ── The figure ──────────────────────────────────────────────────────
         Proportions matter more than detail here. The Android reads the way
         it does because of a very specific silhouette: a domed head about as
         wide as the body, a small gap at the neck, single-piece arms clearly
         *outside* the body outline, and short stubby legs.

         The arms are one capsule each, with no elbow. An earlier version gave
         them a jointed elbow, and folding it simply buried the forearms inside
         the torso — the arms vanished. One rigid capsule per arm both matches
         the character design and makes every pose here trivially readable.  */

      const bot = new THREE.Group();
      const body = new THREE.Group(); // bobs; limbs hang off it
      bot.add(body);

      const R = 0.52; // body radius — everything is proportioned off this

      const head = new THREE.Group();
      head.position.y = 1.68;
      const dome = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.50, 56, 32, 0, Math.PI * 2, 0, Math.PI / 2)),
        green,
      );
      head.add(dome);

      const eyeGeo = keep(new THREE.SphereGeometry(0.062, 20, 20));
      const eyeL = new THREE.Mesh(eyeGeo, white);
      eyeL.position.set(-0.185, 0.2, 0.42);
      const eyeR = new THREE.Mesh(eyeGeo, white);
      eyeR.position.set(0.185, 0.2, 0.42);
      const pupilGeo = keep(new THREE.SphereGeometry(0.03, 14, 14));
      const pupilL = new THREE.Mesh(pupilGeo, dark);
      pupilL.position.set(-0.185, 0.2, 0.462);
      const pupilR = new THREE.Mesh(pupilGeo, dark);
      pupilR.position.set(0.185, 0.2, 0.462);
      head.add(eyeL, eyeR, pupilL, pupilR);

      const antGeo = keep(new THREE.CapsuleGeometry(0.026, 0.34, 6, 12));
      const antL = new THREE.Mesh(antGeo, green);
      antL.position.set(-0.26, 0.38, -0.03);
      antL.rotation.z = 0.62;
      const antR = new THREE.Mesh(antGeo, green);
      antR.position.set(0.26, 0.38, -0.03);
      antR.rotation.z = -0.62;
      head.add(antL, antR);
      body.add(head);

      // Torso: a cylinder with a domed top, so the shoulder line is rounded
      // rather than a hard rim.
      const torso = new THREE.Mesh(keep(new THREE.CylinderGeometry(R, R, 0.66, 56)), green);
      torso.position.y = 0.76;
      const torsoTop = new THREE.Mesh(
        keep(new THREE.SphereGeometry(R, 56, 24, 0, Math.PI * 2, 0, Math.PI / 2)),
        green,
      );
      torsoTop.position.y = 1.10;
      const torsoBase = new THREE.Mesh(keep(new THREE.CircleGeometry(R, 56)), green);
      torsoBase.rotation.x = -Math.PI / 2;
      torsoBase.position.y = 0.42;
      body.add(torso, torsoTop, torsoBase);

      /** One capsule, pivoting at the shoulder. No elbow — see above. */
      function makeArm(side: -1 | 1) {
        const shoulder = new THREE.Group();
        // Sits outside the body radius, which is what keeps the silhouette.
        shoulder.position.set(side * (R + 0.22), 1.30, 0);

        const limb = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.17, 0.5, 8, 24)), green);
        limb.position.y = -0.42;
        shoulder.add(limb);

        body.add(shoulder);
        return { shoulder, limb };
      }
      const armL = makeArm(-1);
      const armR = makeArm(1);

      function makeLeg(side: -1 | 1) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.24, 0.46, 0);

        const limb = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.175, 0.2, 8, 24)), green);
        limb.position.y = -0.24;
        hip.add(limb);

        body.add(hip);
        return { hip };
      }
      const legL = makeLeg(-1);
      const legR = makeLeg(1);

      bot.scale.setScalar(0.9);
      scene.add(bot);

      /* ── The marker ──────────────────────────────────────────────────
         Parented to the writing arm, so it follows the aim for free. Without
         something in the hand the character reads as pointing, not writing. */
      const marker = new THREE.Group();
      const barrel = new THREE.Mesh(
        keep(new THREE.CapsuleGeometry(0.045, 0.24, 6, 16)),
        keepMat(new THREE.MeshStandardMaterial({ color: 0x12233a, roughness: 0.35 })),
      );
      const nib = new THREE.Mesh(
        keep(new THREE.ConeGeometry(0.045, 0.12, 16)),
        keepMat(new THREE.MeshStandardMaterial({ color: 0xa3e635, emissive: 0x4a7a12 })),
      );
      nib.position.y = -0.2;
      nib.rotation.x = Math.PI;
      marker.add(barrel, nib);
      marker.rotation.z = -0.42;
      marker.visible = false;
      scene.add(marker);

      /* ── Sparks ──────────────────────────────────────────────────────
         A short-lived shower off the nib. Points rather than meshes: a
         hundred of these cost one draw call, and the whole effect is a few
         kilobytes of typed array rather than geometry. */
      const SPARKS = 110;
      const sparkPos = new Float32Array(SPARKS * 3);
      const sparkVel = new Float32Array(SPARKS * 3);
      const sparkLife = new Float32Array(SPARKS);
      // Park them off-stage until they are first used.
      for (let i = 0; i < SPARKS; i += 1) sparkPos[i * 3 + 1] = -999;

      const sparkGeo = keep(new THREE.BufferGeometry());
      sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
      const sparkMat = keepMat(
        new THREE.PointsMaterial({
          color: 0xa3e635,
          size: 0.055,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const sparks = new THREE.Points(sparkGeo, sparkMat);
      scene.add(sparks);

      let sparkCursor = 0;
      function emitSparks(at: import('three').Vector3, count: number) {
        for (let n = 0; n < count; n += 1) {
          const i = sparkCursor;
          sparkCursor = (sparkCursor + 1) % SPARKS;
          sparkPos[i * 3] = at.x;
          sparkPos[i * 3 + 1] = at.y;
          sparkPos[i * 3 + 2] = at.z + 0.02;
          sparkVel[i * 3] = (Math.random() - 0.5) * 0.9;
          sparkVel[i * 3 + 1] = Math.random() * 0.9 + 0.15;
          sparkVel[i * 3 + 2] = (Math.random() - 0.2) * 0.5;
          sparkLife[i] = 0.45 + Math.random() * 0.35;
        }
      }

      function stepSparks(dt: number) {
        let alive = false;
        for (let i = 0; i < SPARKS; i += 1) {
          if (sparkLife[i]! <= 0) continue;
          alive = true;
          sparkLife[i]! -= dt;
          sparkVel[i * 3 + 1]! -= 2.4 * dt; // gravity
          sparkPos[i * 3]! += sparkVel[i * 3]! * dt;
          sparkPos[i * 3 + 1]! += sparkVel[i * 3 + 1]! * dt;
          sparkPos[i * 3 + 2]! += sparkVel[i * 3 + 2]! * dt;
          if (sparkLife[i]! <= 0) sparkPos[i * 3 + 1] = -999;
        }
        if (alive) sparkGeo.attributes.position!.needsUpdate = true;
      }

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

      const inkCore = keepMat(new THREE.MeshBasicMaterial({ color: 0x0b2545 }));
      const inkGlow = keepMat(
        new THREE.MeshBasicMaterial({
          color: 0xa3e635,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );

      const inked = strokes.map((stroke) => {
        const curve = new THREE.CatmullRomCurve3(
          stroke.points.map(
            ([x, y]) => new THREE.Vector3(TEXT_X + x * EM, TEXT_Y + y * EM, 0),
          ),
        );
        const segments = Math.max(16, Math.round(stroke.length * 54));

        const core = new THREE.Mesh(keep(new THREE.TubeGeometry(curve, segments, 0.058, 12, false)), inkCore);
        const glow = new THREE.Mesh(keep(new THREE.TubeGeometry(curve, segments, 0.115, 8, false)), inkGlow);
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
        armL.shoulder.position.z = 0;
        armR.shoulder.position.z = 0;
      };

      function poseWalk(t: number) {
        const swing = Math.sin(t * 7.2);
        legL.hip.rotation.set(swing * 0.58, 0, 0);
        legR.hip.rotation.set(-swing * 0.58, 0, 0);
        armL.shoulder.rotation.set(-swing * 0.46, 0, 0);
        armR.shoulder.rotation.set(swing * 0.46, 0, 0);
        armL.shoulder.position.z = 0;
        armR.shoulder.position.z = 0;
        body.position.y = Math.abs(Math.cos(t * 7.2)) * 0.05;
        bot.rotation.z = swing * 0.018;
      }

      function poseStand() {
        legL.hip.rotation.set(0, 0, 0);
        legR.hip.rotation.set(0, 0, 0);
        bot.rotation.z = 0;
      }

      /**
       * Points the writing arm at the pen.
       *
       * The limb hangs along -Y, so rotating that axis onto the shoulder→pen
       * direction aims the whole arm in one step and stays correct wherever
       * the pen is. Per-axis trig is what splayed it sideways first time.
       */
      const DOWN = new THREE.Vector3(0, -1, 0);
      const shoulderWorld = new THREE.Vector3();
      const aim = new THREE.Vector3();

      function poseWrite(target: import('three').Vector3) {
        bot.updateMatrixWorld();
        armL.shoulder.getWorldPosition(shoulderWorld);
        aim.copy(target).sub(shoulderWorld).normalize();
        armL.shoulder.quaternion.setFromUnitVectors(DOWN, aim);
        armL.shoulder.position.z = 0.14;

        armR.shoulder.rotation.set(0.14, 0, -0.06);
        armR.shoulder.position.z = 0;
      }

      /**
       * Arms folded, as in the reference.
       *
       * With one rigid capsule per arm this is a single inward swing: the tip
       * crosses the centre line, and a small Z offset puts one arm in front of
       * the other rather than through it.
       */
      function poseArmsCrossed(blend: number) {
        const b = Math.min(Math.max(blend, 0), 1);
        armR.shoulder.rotation.set(-0.12 * b, 0, -1.34 * b);
        armR.shoulder.position.z = 0.14 * b;
        armL.shoulder.rotation.set(-0.12 * b, 0, 1.34 * b);
        armL.shoulder.position.z = 0.3 * b;
      }

      /* ── Phase machine ───────────────────────────────────────────────── */

      const START_X = -3.5;
      const WRITE_START_X = TEXT_X + BODY_LEAD;
      const FINAL_X = 2.35;

      let phase: Phase = 'wait';
      let clock = 0;
      let drawn = 0;
      let crossBlend = 0;
      let bloom = 0;

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

        if (phase === 'wait') {
          // Nothing moves yet: the page is still settling, and an animation
          // that starts during load is one nobody sees.
          bot.position.x = START_X;
          if (clock >= LEAD_IN_S) {
            phase = 'walkIn';
            clock = 0;
          }
        } else if (phase === 'walkIn') {
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
          bot.position.x = pen.x + BODY_LEAD;
          marker.position.set(pen.x + 0.09, pen.y + 0.19, pen.z + 0.05);
          poseStand();
          poseWrite(pen);
          marker.visible = true;
          // A small settle so he is not rigid while writing.
          body.position.y = Math.sin(clock * 3.1) * 0.012;
          // He watches his own nib, which is what makes it read as writing
          // rather than the arm and the ink being two separate animations.
          const toPen = pen.x - bot.position.x;
          head.rotation.y += (Math.atan2(toPen, 1.9) - head.rotation.y) * 0.12;
          head.rotation.x += (0.24 - head.rotation.x) * 0.08;
          emitSparks(pen, 2);
          // Camera eases in over the write, so the wordmark grows into frame.
          camera.position.z += (6.35 - camera.position.z) * 0.02;
          if (k >= 1) {
            phase = 'exit';
            clock = 0;
            marker.visible = false;
            bloom = 1;
            emitSparks(pen, 26);
          }
        } else if (phase === 'exit') {
          const k = Math.min(clock / EXIT_S, 1);
          const from = pen.x + BODY_LEAD;
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

          // Then do it again. A hero animation that plays once, during page
          // load, is an animation the visitor never actually sees.
          if (clock >= HOLD_S) {
            phase = 'wait';
            clock = 0;
            drawn = 0;
            crossBlend = 0;
            advanceInk(0);
            resetLimbs();
            head.rotation.set(0, 0, 0);
            bot.rotation.set(0, 0, 0);
            camera.position.z = 6.9;
          }
        }

        // A single pulse through the finished wordmark as the pen lifts.
        if (bloom > 0) {
          bloom = Math.max(0, bloom - dt * 1.5);
          inkGlow.opacity = Math.sin(bloom * Math.PI) * 0.55;
        }

        stepSparks(dt);
        shadow.position.x = bot.position.x;
        shadow.scale.setScalar(phase === 'idle' ? 1 : 0.94);
        camera.position.z += (6.9 - camera.position.z) * (phase === 'idle' ? 0.012 : 0);
        camera.lookAt(0, 0.94, 0);
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
