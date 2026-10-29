// Modelos 3D (Three.js) de coche, moto y camión. Solo declara funciones, que
// usan el estado de MAP_SCRIPT_CORE por estar en la misma IIFE.
export const MAP_VEHICLE_SCRIPT = `  function normalizeColor(value) {
    var color = typeof value === 'string' ? value.trim() : '';
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    if (/^#[0-9a-f]{3}$/i.test(color)) {
      return '#' + color.charAt(1) + color.charAt(1) + color.charAt(2) + color.charAt(2) + color.charAt(3) + color.charAt(3);
    }
    if (/^[0-9a-f]{6}$/i.test(color)) return '#' + color;
    return '#ff5a1f';
  }

  function normalizeKind(value) {
    var kinds = ['car', 'motorcycle', 'ev', 'truck'];
    return kinds.indexOf(value) >= 0 ? value : 'car';
  }

  function vehicleBuilder(kind) {
    if (kind === 'motorcycle') return buildMotorcycle;
    if (kind === 'truck') return buildTruck;
    return buildCar;
  }

  function setVehicleInput(input) {
    state.vehicleColor = normalizeColor(input && input.color);
    state.vehicleKind = normalizeKind(input && input.kind);
    if (vehicleMarker) vehicleMarker.getElement().style.setProperty('--car-color', state.vehicleColor);
    if (!car3d) return;
    car3d.paint.color.set(state.vehicleColor);
    if (car3d.kind !== state.vehicleKind) {
      car3d.scene.remove(car3d.model);
      var built = vehicleBuilder(state.vehicleKind)(state.vehicleColor);
      built.group.scale.setScalar(CAR_LENGTH_PX / built.lengthM);
      car3d.model = built.group;
      car3d.paint = built.paint;
      car3d.kind = state.vehicleKind;
      car3d.scene.add(car3d.model);
    }
    renderCar();
  }

  function buildCar(color) {
    var car = new THREE.Group();
    var paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness: 0.25, roughness: 0.35 });
    var trim = new THREE.MeshStandardMaterial({ color: 0x11161d, metalness: 0.35, roughness: 0.55 });
    var glass = new THREE.MeshStandardMaterial({ color: 0x0a141d, metalness: 0.75, roughness: 0.18, side: THREE.DoubleSide });
    var rubber = new THREE.MeshStandardMaterial({ color: 0x080a0d, roughness: 0.95 });
    var rim = new THREE.MeshStandardMaterial({ color: 0x95a1b4, metalness: 0.85, roughness: 0.3 });
    var headlight = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe9b0, emissiveIntensity: 1.8, roughness: 0.25 });
    var taillight = new THREE.MeshStandardMaterial({ color: 0xff3040, emissive: 0xff2233, emissiveIntensity: 1.2, roughness: 0.3 });

    var shape = new THREE.Shape();
    shape.moveTo(-2.05, 0.28);
    shape.lineTo(-2.1, 0.62);
    shape.lineTo(-2.02, 0.94);
    shape.lineTo(-1.55, 1.02);
    shape.lineTo(-1.15, 1.38);
    shape.lineTo(0.35, 1.42);
    shape.lineTo(0.95, 1.08);
    shape.lineTo(1.7, 0.98);
    shape.lineTo(2.08, 0.78);
    shape.lineTo(2.1, 0.45);
    shape.lineTo(2.02, 0.28);
    shape.lineTo(-2.05, 0.28);

    var bodyGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: 1.72,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.06,
      bevelSegments: 2,
      curveSegments: 1
    });
    bodyGeometry.translate(0, 0, -0.86);
    car.add(new THREE.Mesh(bodyGeometry, paint));

    var windowShape = new THREE.Shape();
    windowShape.moveTo(-1.02, 1.0);
    windowShape.lineTo(-0.86, 1.31);
    windowShape.lineTo(0.18, 1.34);
    windowShape.lineTo(0.72, 1.03);
    windowShape.lineTo(-1.02, 1.0);
    var windowGeometry = new THREE.ShapeGeometry(windowShape);
    var leftWindow = new THREE.Mesh(windowGeometry, glass);
    leftWindow.position.z = 0.94;
    car.add(leftWindow);
    var rightWindow = new THREE.Mesh(windowGeometry, glass);
    rightWindow.position.z = -0.94;
    car.add(rightWindow);

    var windshield = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.52, 1.46), glass);
    windshield.position.set(0.68, 1.2, 0);
    windshield.rotation.z = -0.62;
    car.add(windshield);
    var rearWindow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 1.4), glass);
    rearWindow.position.set(-1.24, 1.18, 0);
    rearWindow.rotation.z = 0.62;
    car.add(rearWindow);

    var mirrorGeometry = new THREE.BoxGeometry(0.18, 0.1, 0.14);
    [0.98, -0.98].forEach(function (z) {
      var mirror = new THREE.Mesh(mirrorGeometry, trim);
      mirror.position.set(0.62, 1.05, z);
      car.add(mirror);
    });

    var wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18);
    wheelGeometry.rotateX(Math.PI / 2);
    var hubGeometry = new THREE.CylinderGeometry(0.17, 0.17, 0.25, 12);
    hubGeometry.rotateX(Math.PI / 2);
    [[-1.35, 0.92], [-1.35, -0.92], [1.35, 0.92], [1.35, -0.92]].forEach(function (position) {
      var wheel = new THREE.Mesh(wheelGeometry, rubber);
      wheel.position.set(position[0], 0.34, position[1]);
      car.add(wheel);
      var hub = new THREE.Mesh(hubGeometry, rim);
      hub.position.set(position[0], 0.34, position[1]);
      car.add(hub);
    });

    var headlightGeometry = new THREE.BoxGeometry(0.08, 0.16, 0.38);
    [0.5, -0.5].forEach(function (z) {
      var light = new THREE.Mesh(headlightGeometry, headlight);
      light.position.set(2.04, 0.82, z);
      car.add(light);
      var tail = new THREE.Mesh(headlightGeometry, taillight);
      tail.position.set(-2.04, 0.84, z);
      car.add(tail);
    });

    var grille = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.74), trim);
    grille.position.set(2.08, 0.58, 0);
    car.add(grille);
    var plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.12, 0.36),
      new THREE.MeshStandardMaterial({ color: 0xe8edf4, roughness: 0.5 })
    );
    plate.position.set(2.1, 0.44, 0);
    car.add(plate);

    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.36, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(2.3, 1.1, 1);
    shadow.position.y = 0.02;
    car.add(shadow);

    car.traverse(function (object) {
      if (!object.material) return;
      var materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(function (material) {
        material.side = THREE.DoubleSide;
      });
    });

    return { group: car, paint: paint, lengthM: 4.2 };
  }

  function buildMotorcycle(color) {
    var group = new THREE.Group();
    var paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness: 0.25, roughness: 0.35 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.6 });
    var chrome = new THREE.MeshStandardMaterial({ color: 0x9aa6b8, metalness: 0.7, roughness: 0.3 });
    var lightMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe9b0, emissiveIntensity: 1.6, roughness: 0.3 });
    var tailMat = new THREE.MeshStandardMaterial({ color: 0xff3040, emissive: 0xff2233, emissiveIntensity: 1.1, roughness: 0.3 });

    var wheelGeometry = new THREE.CylinderGeometry(0.33, 0.33, 0.14, 16);
    wheelGeometry.rotateX(Math.PI / 2);
    var frontWheel = new THREE.Mesh(wheelGeometry, dark);
    frontWheel.position.set(0.75, 0.33, 0);
    group.add(frontWheel);
    var rearWheel = new THREE.Mesh(wheelGeometry, dark);
    rearWheel.position.set(-0.75, 0.33, 0);
    group.add(rearWheel);

    var body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 0.34), paint);
    body.position.set(0, 0.75, 0);
    group.add(body);
    var tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.36), paint);
    tank.position.set(0.2, 1.02, 0);
    group.add(tank);
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), dark);
    seat.position.set(-0.4, 1.0, 0);
    group.add(seat);
    var fork = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.6, 0.09), chrome);
    fork.position.set(0.72, 0.62, 0);
    group.add(fork);
    var handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.72), chrome);
    handlebar.position.set(0.58, 1.08, 0);
    group.add(handlebar);
    var headlight = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, 0.18), lightMat);
    headlight.position.set(0.86, 0.9, 0);
    group.add(headlight);
    var taillight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.2), tailMat);
    taillight.position.set(-1.02, 0.82, 0);
    group.add(taillight);

    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.05, 0.5, 1);
    shadow.position.y = 0.02;
    group.add(shadow);

    group.traverse(function (object) {
      if (!object.material) return;
      var materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(function (material) {
        material.side = THREE.DoubleSide;
      });
    });

    return { group: group, paint: paint, lengthM: 2.1 };
  }

  function buildTruck(color) {
    var group = new THREE.Group();
    var paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness: 0.25, roughness: 0.35 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.6 });
    var glass = new THREE.MeshStandardMaterial({ color: 0x0a141d, metalness: 0.75, roughness: 0.18, side: THREE.DoubleSide });
    var cargo = new THREE.MeshStandardMaterial({ color: 0xd8dee6, roughness: 0.55 });
    var lightMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe9b0, emissiveIntensity: 1.6, roughness: 0.3 });
    var tailMat = new THREE.MeshStandardMaterial({ color: 0xff3040, emissive: 0xff2233, emissiveIntensity: 1.1, roughness: 0.3 });

    var chassis = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.3, 2.0), dark);
    chassis.position.set(0, 0.55, 0);
    group.add(chassis);
    var cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.9, 2.1), paint);
    cab.position.set(2.4, 1.6, 0);
    group.add(cab);
    var windshield = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 1.8), glass);
    windshield.position.set(3.26, 1.95, 0);
    group.add(windshield);
    var cargoBox = new THREE.Mesh(new THREE.BoxGeometry(4.3, 2.2, 2.2), cargo);
    cargoBox.position.set(-0.9, 1.8, 0);
    group.add(cargoBox);

    var wheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 18);
    wheelGeometry.rotateX(Math.PI / 2);
    [[2.4, 0.95], [2.4, -0.95], [-1.6, 0.95], [-1.6, -0.95], [-2.8, 0.95], [-2.8, -0.95]].forEach(function (position) {
      var wheel = new THREE.Mesh(wheelGeometry, dark);
      wheel.position.set(position[0], 0.5, position[1]);
      group.add(wheel);
    });

    var lightGeometry = new THREE.BoxGeometry(0.08, 0.16, 0.38);
    [0.8, -0.8].forEach(function (z) {
      var head = new THREE.Mesh(lightGeometry, lightMat);
      head.position.set(3.3, 0.75, z);
      group.add(head);
      var tail = new THREE.Mesh(lightGeometry, tailMat);
      tail.position.set(-3.06, 0.75, z);
      group.add(tail);
    });

    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.36, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(3.4, 1.15, 1);
    shadow.position.y = 0.02;
    group.add(shadow);

    group.traverse(function (object) {
      if (!object.material) return;
      var materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(function (material) {
        material.side = THREE.DoubleSide;
      });
    });

    return { group: group, paint: paint, lengthM: 6.8 };
  }

  function sizeCar() {
    if (!car3d) return;
    var container = map.getContainer();
    car3d.width = container.clientWidth;
    car3d.height = container.clientHeight;
    car3d.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, caravanaPerfScale));
    car3d.renderer.setSize(car3d.width, car3d.height, false);
    car3d.camera.left = -car3d.width / 2;
    car3d.camera.right = car3d.width / 2;
    car3d.camera.top = car3d.height / 2;
    car3d.camera.bottom = -car3d.height / 2;
    car3d.camera.updateProjectionMatrix();
  }

  function createCar3D() {
    var canvas = document.createElement('canvas');
    canvas.id = 'caravana-car';
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1;display:none';
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true });
    renderer.setClearColor(0x000000, 0);
    map.getContainer().appendChild(canvas);
    var scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    var sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.6, 1, 0.4);
    scene.add(sun);
    var built = vehicleBuilder(state.vehicleKind)(state.vehicleColor);
    built.group.scale.setScalar(CAR_LENGTH_PX / built.lengthM);
    built.group.traverse(function (object) {
      object.frustumCulled = false;
    });
    scene.add(built.group);
    car3d = {
      canvas: canvas,
      renderer: renderer,
      scene: scene,
      camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000),
      model: built.group,
      paint: built.paint,
      kind: state.vehicleKind,
      width: 0,
      height: 0
    };
    lastCarKey = '';
    sizeCar();
  }

  function aheadLngLat(location, heading, meters) {
    var radians = heading * Math.PI / 180;
    var latitude = location.latitude;
    return [
      location.longitude + meters * Math.sin(radians) / (111320 * Math.cos(latitude * Math.PI / 180)),
      latitude + meters * Math.cos(radians) / 111320
    ];
  }
`;
