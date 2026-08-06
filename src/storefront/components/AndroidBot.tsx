import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * The Android mascot, ported from the legacy storefront.
 *
 * Three things changed in the port:
 *
 * 1. Three.js is a dynamic import, so it lands in its own chunk and never
 *    blocks first paint. The legacy page loaded it from a CDN in <head>.
 * 2. It only initialises once scrolled into view, and only when the visitor
 *    has not asked for reduced motion, is not on Save-Data, and has more than
 *    2GB of reported memory. A WebGL scene is the wrong thing to force onto
 *    the budget Android we are trying to sell them.
 * 3. Cleanup disposes geometries and materials as well as the renderer. The
 *    original disposed only the renderer, which leaks GPU memory on every
 *    unmount — survivable on a page that never navigated, a real problem now
 *    that the shop is a single-page app.
 */
export function AndroidBot({ className }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  // Gate: decide whether this visitor should get a WebGL scene at all.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (connection?.saveData) return;

    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof memory === 'number' && memory <= 2) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
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
    let cleanup: (() => void) | undefined;

    void (async () => {
      const THREE = await import('three');
      if (disposed || !mountRef.current) return;

      let width = mount.clientWidth || 420;
      let height = mount.clientHeight || 460;

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        });
      } catch {
        // No WebGL context — the page is still complete without the mascot.
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
      camera.position.set(0, 0.4, 9);

      // Bright key, lime rim, cyan fill — the rim is what ties it to the brand.
      scene.add(new THREE.AmbientLight(0xbfe8a0, 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(4, 6, 6);
      const rim = new THREE.PointLight(0xa3e635, 2.2, 40);
      rim.position.set(-5, 2, 3);
      const fill = new THREE.PointLight(0x22d3ee, 0.9, 40);
      fill.position.set(5, -2, 4);
      scene.add(key, rim, fill);

      // Everything disposable is tracked so unmount can actually free it.
      const geometries: import('three').BufferGeometry[] = [];
      const track = <G extends import('three').BufferGeometry>(geometry: G): G => {
        geometries.push(geometry);
        return geometry;
      };

      const green = new THREE.MeshStandardMaterial({
        color: 0x9ee84b,
        roughness: 0.35,
        metalness: 0.15,
        emissive: 0x2c4b12,
        emissiveIntensity: 0.35,
      });
      const white = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3,
        emissive: 0x223044,
        emissiveIntensity: 0.2,
      });

      const bot = new THREE.Group();
      const head = new THREE.Group();

      head.add(
        new THREE.Mesh(
          track(new THREE.SphereGeometry(1.25, 48, 32, 0, Math.PI * 2, 0, Math.PI / 2)),
          green,
        ),
      );

      const eyeGeo = track(new THREE.SphereGeometry(0.16, 24, 24));
      const eyeL = new THREE.Mesh(eyeGeo, white);
      eyeL.position.set(-0.45, 0.5, 1.08);
      const eyeR = new THREE.Mesh(eyeGeo, white);
      eyeR.position.set(0.45, 0.5, 1.08);
      head.add(eyeL, eyeR);

      const antGeo = track(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 12));
      const antL = new THREE.Mesh(antGeo, green);
      antL.position.set(-0.62, 1.15, 0);
      antL.rotation.z = 0.5;
      const antR = new THREE.Mesh(antGeo, green);
      antR.position.set(0.62, 1.15, 0);
      antR.rotation.z = -0.5;
      head.add(antL, antR);

      head.position.y = 1.15;
      bot.add(head);

      const body = new THREE.Mesh(track(new THREE.CylinderGeometry(1.25, 1.25, 1.7, 48, 1)), green);
      body.position.y = 0.25;
      const belly = new THREE.Mesh(
        track(new THREE.SphereGeometry(1.25, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2)),
        green,
      );
      belly.position.y = 1.1;
      const base = new THREE.Mesh(track(new THREE.CircleGeometry(1.25, 48)), green);
      base.rotation.x = -Math.PI / 2;
      base.position.y = -0.6;
      bot.add(body, belly, base);

      const limb = (x: number, y: number, h: number) => {
        const group = new THREE.Group();
        const cyl = new THREE.Mesh(track(new THREE.CylinderGeometry(0.32, 0.32, h, 24)), green);
        const cap = new THREE.Mesh(track(new THREE.SphereGeometry(0.32, 24, 24)), green);
        cap.position.y = -h / 2;
        group.add(cyl, cap);
        group.position.set(x, y, 0);
        return group;
      };
      bot.add(limb(-1.65, 0.35, 1.25), limb(1.65, 0.35, 1.25));
      bot.add(limb(-0.5, -1.35, 0.9), limb(0.5, -1.35, 0.9));

      bot.scale.set(1.18, 1.18, 1.18);
      scene.add(bot);

      // Pointer position drives a target rotation the bot eases toward.
      const target = { x: 0, y: 0 };
      const onMove = (event: PointerEvent) => {
        target.x = (event.clientX / window.innerWidth) * 2 - 1;
        target.y = (event.clientY / window.innerHeight) * 2 - 1;
      };
      window.addEventListener('pointermove', onMove, { passive: true });

      let raf = 0;
      let t = 0;
      const animate = () => {
        raf = requestAnimationFrame(animate);
        t += 0.016;

        const ry = target.x * 0.9;
        const rx = target.y * 0.45;
        bot.rotation.y += (ry - bot.rotation.y) * 0.08;
        bot.rotation.x += (rx - bot.rotation.x) * 0.08;
        head.rotation.y += (ry * 0.5 - head.rotation.y) * 0.1;
        head.rotation.x += (rx * 0.6 - head.rotation.x) * 0.1;
        bot.position.y = Math.sin(t * 1.4) * 0.12;

        renderer.render(scene, camera);
      };
      animate();

      const onResize = () => {
        width = mount.clientWidth;
        height = mount.clientHeight;
        if (!width || !height) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      };
      window.addEventListener('resize', onResize);

      // Stop rendering entirely when the tab is hidden — an unseen rAF loop
      // is pure battery drain.
      const onVisibility = () => {
        if (document.hidden) cancelAnimationFrame(raf);
        else animate();
      };
      document.addEventListener('visibilitychange', onVisibility);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibility);

        geometries.forEach((geometry) => geometry.dispose());
        green.dispose();
        white.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [active]);

  return (
    <div
      ref={mountRef}
      aria-hidden
      className={cn(
        'h-[300px] w-full max-w-[480px] cursor-grab select-none',
        '[&>canvas]:!h-full [&>canvas]:!w-full [&>canvas]:block',
        'lg:h-[440px]',
        className,
      )}
      style={{ filter: 'drop-shadow(0 30px 60px rgb(163 230 53 / 0.28))' }}
    />
  );
}
