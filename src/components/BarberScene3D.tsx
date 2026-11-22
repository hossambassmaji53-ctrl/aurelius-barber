import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const BarberScene3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x09090c);
    scene.fog = new THREE.FogExp2(0x09090c, 0.045);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.8, 11.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Mandatory studio environment reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 3-Point Warm/Cool Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0x9bb8d8, 0x1a1410, 0.65);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffdfb0, 2.4);
    keyLight.position.set(6, 8, 7);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xd4a853, 1.5);
    rimLight.position.set(-7, 4, -5);
    scene.add(rimLight);

    // Procedural Barber Pole Stripe Texture
    const stripeCanvas = document.createElement('canvas');
    stripeCanvas.width = 512;
    stripeCanvas.height = 512;
    const sCtx = stripeCanvas.getContext('2d');
    if (sCtx) {
      sCtx.fillStyle = '#F3EFE6';
      sCtx.fillRect(0, 0, 512, 512);
      sCtx.save();
      sCtx.translate(256, 256);
      sCtx.rotate(-Math.PI / 4);
      const stripeW = 48;
      for (let x = -768; x < 768; x += stripeW * 4) {
        // Rich crimson
        sCtx.fillStyle = '#9E1B24';
        sCtx.fillRect(x, -768, stripeW, 1536);
        // Deep royal obsidian navy
        sCtx.fillStyle = '#14243D';
        sCtx.fillRect(x + stripeW * 2, -768, stripeW, 1536);
        // Subtle champagne gold pinstripe
        sCtx.fillStyle = '#D4A853';
        sCtx.fillRect(x + stripeW + 3, -768, 5, 1536);
      }
      sCtx.restore();
    }
    const poleTexture = new THREE.CanvasTexture(stripeCanvas);
    poleTexture.colorSpace = THREE.SRGBColorSpace;
    poleTexture.wrapS = THREE.RepeatWrapping;
    poleTexture.wrapT = THREE.RepeatWrapping;
    poleTexture.repeat.set(1, 2.5);
    poleTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    // Shared PBR Materials
    const brushedBrassMat = new THREE.MeshPhysicalMaterial({
      color: 0xd4a853,
      metalness: 0.94,
      roughness: 0.18,
      anisotropy: 0.75,
      clearcoat: 0.35,
    });

    const brushedSteelMat = new THREE.MeshPhysicalMaterial({
      color: 0xd8dde4,
      metalness: 0.96,
      roughness: 0.14,
      anisotropy: 0.8,
    });

    const ebonyWoodMat = new THREE.MeshStandardMaterial({
      color: 0x261a14,
      metalness: 0.08,
      roughness: 0.58,
    });

    const glassTubeMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.06,
      transmission: isSoftwareGl ? 0 : 0.88,
      transparent: true,
      opacity: isSoftwareGl ? 0.25 : 1,
      ior: 1.52,
      thickness: 0.4,
      clearcoat: 1.0,
      depthWrite: false,
    });

    const poleCoreMat = new THREE.MeshStandardMaterial({
      map: poleTexture,
      roughness: 0.32,
      metalness: 0.08,
      emissive: 0x2a1d12,
      emissiveIntensity: 0.22,
    });

    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const materialsToDispose: THREE.Material[] = [
      brushedBrassMat,
      brushedSteelMat,
      ebonyWoodMat,
      glassTubeMat,
      poleCoreMat,
    ];

    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      geometriesToDispose.push(g);
      return g;
    };

    // 1. Composite Hero Barber Pole (Left side backdrop)
    const poleGroup = new THREE.Group();
    poleGroup.position.set(-4.3, 0.2, -1.2);
    poleGroup.rotation.z = -0.06;

    const coreCyl = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.48, 0.48, 3.6, 36)),
      poleCoreMat
    );
    poleGroup.add(coreCyl);

    const glassCyl = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.56, 0.56, 3.64, 36)),
      glassTubeMat
    );
    glassCyl.renderOrder = 2;
    poleGroup.add(glassCyl);

    // Top & Bottom Lathe Finials
    const capProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.62, 0.0),
      new THREE.Vector2(0.66, 0.14),
      new THREE.Vector2(0.54, 0.28),
      new THREE.Vector2(0.32, 0.48),
      new THREE.Vector2(0.36, 0.62),
      new THREE.Vector2(0.18, 0.78),
      new THREE.Vector2(0.0, 0.85),
    ];
    const topCap = new THREE.Mesh(
      trackGeo(new THREE.LatheGeometry(capProfile, 32)),
      brushedBrassMat
    );
    topCap.position.y = 1.82;
    poleGroup.add(topCap);

    const bottomCap = new THREE.Mesh(
      trackGeo(new THREE.LatheGeometry(capProfile, 32)),
      brushedBrassMat
    );
    bottomCap.rotation.x = Math.PI;
    bottomCap.position.y = -1.82;
    poleGroup.add(bottomCap);

    // Brass decorative collar rings
    const collarGeo = trackGeo(new THREE.TorusGeometry(0.58, 0.045, 16, 40));
    const topCollar = new THREE.Mesh(collarGeo, brushedBrassMat);
    topCollar.rotation.x = Math.PI / 2;
    topCollar.position.y = 1.82;
    poleGroup.add(topCollar);

    const bottomCollar = new THREE.Mesh(collarGeo, brushedBrassMat);
    bottomCollar.rotation.x = Math.PI / 2;
    bottomCollar.position.y = -1.82;
    poleGroup.add(bottomCollar);

    // Wall mounting arm
    const mountArm = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.9, 0.14, 0.18)),
      ebonyWoodMat
    );
    mountArm.position.set(-0.55, 1.4, -0.3);
    poleGroup.add(mountArm);

    scene.add(poleGroup);

    // 2. Composite Barber Shears (Right foreground)
    const shearsGroup = new THREE.Group();
    shearsGroup.position.set(4.1, 1.1, 0.4);
    shearsGroup.rotation.set(0.25, -0.4, 0.55);

    const buildShearHalf = (mirror: number) => {
      const half = new THREE.Group();
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(0, -0.04);
      bladeShape.lineTo(1.7, -0.02);
      bladeShape.quadraticCurveTo(1.95, 0.0, 1.72, 0.08);
      bladeShape.lineTo(0, 0.11);
      bladeShape.lineTo(-0.55, 0.08);
      bladeShape.lineTo(-0.55, -0.02);
      bladeShape.closePath();

      const bladeGeo = trackGeo(
        new THREE.ExtrudeGeometry(bladeShape, {
          depth: 0.04,
          bevelEnabled: true,
          bevelThickness: 0.012,
          bevelSize: 0.012,
          bevelSegments: 2,
        })
      );
      const blade = new THREE.Mesh(bladeGeo, brushedSteelMat);
      blade.position.z = mirror * 0.025;
      half.add(blade);

      const ringGeo = trackGeo(new THREE.TorusGeometry(0.26, 0.045, 16, 32));
      const ring = new THREE.Mesh(ringGeo, brushedBrassMat);
      ring.position.set(-0.8, mirror * 0.18, mirror * 0.025);
      half.add(ring);

      const stem = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.038, 0.038, 0.35, 12)),
        brushedSteelMat
      );
      stem.rotation.z = Math.PI / 2 - mirror * 0.35;
      stem.position.set(-0.62, mirror * 0.08, mirror * 0.025);
      half.add(stem);

      return half;
    };

    const shearTop = buildShearHalf(1);
    shearTop.rotation.z = 0.28;
    const shearBot = buildShearHalf(-1);
    shearBot.rotation.z = -0.28;

    const pivotScrew = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 18)),
      brushedBrassMat
    );
    pivotScrew.rotation.x = Math.PI / 2;
    shearsGroup.add(shearTop, shearBot, pivotScrew);
    scene.add(shearsGroup);

    // 3. Composite Straight Razor (Bottom right accent)
    const razorGroup = new THREE.Group();
    razorGroup.position.set(3.4, -1.65, -0.4);
    razorGroup.rotation.set(-0.2, -0.35, -0.3);

    const handle = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.75, 0.24, 0.14)),
      ebonyWoodMat
    );
    handle.position.set(-0.4, 0, 0);
    razorGroup.add(handle);

    const tang = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.55, 0.12, 0.06)),
      brushedBrassMat
    );
    tang.position.set(0.65, 0.12, 0);
    tang.rotation.z = 0.42;
    razorGroup.add(tang);

    const razorBlade = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.4, 0.26, 0.035)),
      brushedSteelMat
    );
    razorBlade.position.set(1.28, 0.46, 0);
    razorBlade.rotation.z = 0.42;
    razorGroup.add(razorBlade);

    const razorPin = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 14)),
      brushedBrassMat
    );
    razorPin.rotation.x = Math.PI / 2;
    razorPin.position.set(0.4, 0.02, 0);
    razorGroup.add(razorPin);

    scene.add(razorGroup);

    // 4. Instanced Golden Atmospheric Motes
    const moteCount = 64;
    const moteGeo = trackGeo(new THREE.OctahedronGeometry(0.038, 0));
    const moteMat = new THREE.MeshStandardMaterial({
      color: 0xf4cf7b,
      emissive: 0xd4a853,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.85,
    });
    materialsToDispose.push(moteMat);

    const motes = new THREE.InstancedMesh(moteGeo, moteMat, moteCount);
    const dummy = new THREE.Object3D();
    const moteSeeds: { x: number; y: number; z: number; speed: number; scale: number }[] = [];

    for (let i = 0; i < moteCount; i++) {
      const seed = {
        x: (Math.random() - 0.5) * 16,
        y: (Math.random() - 0.5) * 9,
        z: (Math.random() - 0.5) * 7 - 1.5,
        speed: 0.2 + Math.random() * 0.45,
        scale: 0.5 + Math.random() * 1.1,
      };
      moteSeeds.push(seed);
      dummy.position.set(seed.x, seed.y, seed.z);
      dummy.scale.setScalar(seed.scale);
      dummy.updateMatrix();
      motes.setMatrixAt(i, dummy.matrix);
    }
    motes.computeBoundingSphere();
    motes.frustumCulled = false;
    scene.add(motes);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let pointerX = 0;
    let pointerY = 0;
    const handlePointerMove = (e: PointerEvent) => {
      pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      pointerY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        coreCyl.rotation.y += dt * 1.15;
        poleGroup.position.y = 0.2 + Math.sin(elapsed * 0.7) * 0.12;

        shearsGroup.position.y = 1.1 + Math.sin(elapsed * 0.9 + 1) * 0.18;
        shearsGroup.rotation.y = -0.4 + Math.sin(elapsed * 0.5) * 0.18;
        shearTop.rotation.z = 0.24 + Math.sin(elapsed * 1.4) * 0.08;
        shearBot.rotation.z = -0.24 - Math.sin(elapsed * 1.4) * 0.08;

        razorGroup.position.y = -1.65 + Math.cos(elapsed * 0.8) * 0.15;
        razorGroup.rotation.y = -0.35 + Math.cos(elapsed * 0.45) * 0.16;

        for (let i = 0; i < moteCount; i++) {
          const s = moteSeeds[i];
          const yy = ((s.y + elapsed * s.speed + 4.5) % 9) - 4.5;
          dummy.position.set(s.x + Math.sin(elapsed * 0.5 + i) * 0.15, yy, s.z);
          dummy.rotation.set(elapsed * 0.5 + i, elapsed * 0.4, 0);
          dummy.scale.setScalar(s.scale);
          dummy.updateMatrix();
          motes.setMatrixAt(i, dummy.matrix);
        }
        motes.instanceMatrix.needsUpdate = true;
      }

      camera.position.x = THREE.MathUtils.damp(camera.position.x, pointerX * 0.45, 3, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, 0.8 + pointerY * 0.3, 3, dt);
      camera.lookAt(0, 0.1, 0);

      renderer.render(scene, camera);

      if (prefersReducedMotion) return;
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      poleTexture.dispose();
      envTarget.dispose();
      geometriesToDispose.forEach((g) => g.dispose());
      materialsToDispose.forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none"
    />
  );
};
            
