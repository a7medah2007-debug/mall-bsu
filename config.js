const SCENE = {
  background: "#5D4037",
  ambientLight: { color: "#fff5e6", intensity: 1.0 },
  directionalLight: { color: "#fff5e6", intensity: 1.0, position: [1.667, 4, 1.667] },
  hemisphereLight: { skyColor: "#ffffff", groundColor: "#5D4037", intensity: 0.6 },
  pointLights: [
    { color: "#fff5e6", intensity: 0.8, position: [0, 1.667, 0] },
    { color: "#fff5e6", intensity: 0.6, position: [-3.333, 1, 3.333] },
    { color: "#fff5e6", intensity: 0.6, position: [3.333, 1, 3.333] },
    { color: "#fff5e6", intensity: 0.5, position: [-6.667, 1, 16.667] },
    { color: "#fff5e6", intensity: 0.5, position: [6.667, 1, 16.667] },
  ],
  ground: { width: 66.667, height: 66.667, color: "#5D4037", visible: false }
};

const CAMERA = {
  position: [-6.23, 0.567, -3.7],
  startPosition: [-6.23, 0.533, -3.7],
  fov: 75,
  near: 0.1,
  far: 1000,
  heightLimit: { min: 0.167, max: 1.333 },
  vrFixedHeight: 1.7,
};

const PLAYER = {
  moveSpeed: 1.667,
  verticalSpeed: 0.017,
  snapAngle: 45,
  snapCooldown: 300,
};

const MALL = {
  model: 'assets/models/mall.glb',
  position: [0, 0, 0],
  scale: [0.333, 0.333, 0.333],
};

const PRODUCTS = {
  chips2: {
    name: 'شيبسي 15 جنيه',
    model: 'assets/models/chips2.glb',
    price: 15,
    scale: [0.133, 0.133, 0.133],
    shelves: [
      { position: [-1.443, 1.417, 19.897], countX: 1, countZ: 1, spacingX: 0.4, spacingZ: -0.167, rotation: [0, 0, 0] },
      { position: [-1.443, 0.877, 19.897], countX: 1, countZ: 1, spacingX: 0.4, spacingZ: -0.167, rotation: [180, 0, 0] },
    ]
  },
  chips3: {
    name: 'شيبسي 10 جنيه',
    model: 'assets/models/chips3.glb',
    price: 10,
    scale: [0.133, 0.133, 0.133],
    shelves: [
      { position: [6.4, 1.433, 13.617], countX: 1, countZ: 1, spacingX: -0.167, spacingZ: 0.333, rotation: [0, 0, -135] },
      { position: [6.4, 0.877, 13.617], countX: 1, countZ: 1, spacingX: -0.167, spacingZ: 0.333, rotation: [0, -160, -135] },
    ]
  }
};

const FRIDGES = {
  model: 'assets/models/fridge.glb',
  scale: [1.333, 1.333, 1.333],
  positions: [
    { position: [-3.233, 0, 20.633], rotation: [0, -Math.PI/2, 0] },
    { position: [-3.233, 0, 21.833], rotation: [0, -Math.PI/2, 0] },
  ]
};

const JUICES = {
  model: 'assets/models/can3.glb',
  name: 'عصير 25 جنيه',
  price: 25,
  scale: [0.167, 0.167, 0.167],
  inFridge: [
    { startX: -3.6, startY: 1.817, startZ: 20.167, shelves: 1, bottlesPerShelf: 1, spacingY: 0.4, spacingZ: 0.087 },
  ]
};

const WATER = {
  model: 'assets/models/water.glb',
  name: 'مياه 10 جنيه',
  price: 10,
  scale: [0.05, 0.05, 0.05],
  inFridge: [
    { startX: -3.6, startY: 2.1, startZ: 21.367, shelves: 1, bottlesPerShelf: 1, spacingY: 0.4, spacingZ: 0.087 },
  ]
};

const VEGETABLES = {
  items: [
    { model: 'assets/models/eggplant.glb',  position: [-8.643, 0.667, 41.88], count: 0, scale: [0.00667, 0.00667, 0.00667], boxSize: [0.667, 0.667], price: 10 },
    { model: 'assets/models/tomato.glb', position: [-8.643, 0.667, 43.213], count: 0, scale: [0.001, 0.001, 0.001], boxSize: [0.667, 0.667], price: 12 },
    { model: 'assets/models/pepper.glb', position: [-8.643, 0.667, 44.547], count: 0, scale: [0.00333, 0.00333, 0.00333], boxSize: [0.667, 0.667], price: 15 },
    { model: 'assets/models/potatoes.glb', position: [-8.643, 0.667, 45.823], count: 0, scale: [0.01, 0.01, 0.01], boxSize: [0.667, 0.667], price: 8  },
  ]
};

const PRICE_BOARDS = [
  { 
    name: 'شيبسي 15 ج', 
    price: 15, 
    position: [1.157, 1.167, 19.5],
    rotation: [0, -135, 0], 
    size: [0.5, 0.167] 
  },
  { 
    name: 'شيبسي 15 ج', 
    price: 15, 
    position: [1.157, 0.733, 19.5],
    rotation: [0, -135, 0], 
    size: [0.5, 0.167] 
  },
  { 
    name: ' كراتيه 10 جنيه ', 
    price: 10, 
    position: [6.167, 1.167, 16.283],
    rotation: [0, -Math.PI/2, 0], 
    size: [0.5, 0.167] 
  },
  { 
    name: 'عصير 25 ج', 
    price: 25, 
    position: [-3.233, 1.833, 20.0],
    rotation: [0, -Math.PI/2, 0], 
    size: [0.833, 0.2] 
  },
  { 
    name: 'مياه 10 ج', 
    price: 10, 
    position: [-3.233, 1.833, 21.333],
    rotation: [0, -Math.PI/2, 0], 
    size: [0.833, 0.2] 
  },
  { 
    name: '  باذنجان ( الكيلو ب 10 )', 
    price: 10, 
    position: [-8.643, 1.167, 41.88], 
    rotation: [0, Math.PI/2, 0], 
    size: [0.5, 0.167] 
  },
  { 
    name: '       طماطم ( الكيلو 12 جنيه )', 
    price: 12, 
    position: [-8.643, 1.167, 43.213], 
    rotation: [0, Math.PI/2, 0], 
    size: [0.5, 0.167] 
  },
  { 
    name: ' فلفل (  الكيلو 15 جنيه )', 
    price: 15, 
    position: [-8.643, 1.167, 44.547], 
    rotation: [0, Math.PI/2, 0], 
    size: [0.5, 0.167] 
  },
  { 
    name: ' بطاطس (الكيلو 8 جنيه )', 
    price: 8, 
    position: [-8.643, 1.167, 45.823], 
    rotation: [0, Math.PI/2, 0], 
    size: [0.5, 0.167] 
  },
  { 
    name: 'خضار 20 ج', 
    price: 20, 
    position: [-8.643, 1.167, 47.533], 
    rotation: [0, Math.PI/2, 0], 
    size: [0.5, 0.167] 
  },
];

const SIGNS = [];

const STAFF = {
  cashier: {
    model: 'assets/models/human.glb',
    position: [-3.88, 1.0, 11.67],
    scale: [0.667, 0.667, 0.667],
  },
  guards: [
   { model: 'assets/models/guard.glb', position: [-5.857, 0, 38.113], scale: [0.9, 0.9, 0.9] },
    { model: 'assets/models/guard.glb', position: [-9.133, 0, 36.903], scale: [0.9, 0.9, 0.9] },
    { model: 'assets/models/guard.glb', position: [7.773, 0, -0.177], scale: [0.9, 0.9, 0.9] },
    { model: 'assets/models/guard.glb', position: [-5.85, 0, -0.71], scale: [0.9, 0.9, 0.9] },
  ],
  noPassZone: {
    guardIndex: 3,
    xMin: -6.667,
    xMax: 0,
    zMin: -4.667,
    zMax: -1.543,
  }
};

const CARTS = {
  model: 'assets/models/cart.glb',
  scale: [1.5, 1.5, 1.5],
  positions: [
    [1.323, 0, 15.397],
    [4.383, 0, 14.04],
  ]
};

const WALKERS = {
  models: [
 
    {
      path: 'assets/models/walker2.glb',
      scaleMin: 0.5,
      scaleMax: 0.6,
    }
  ],
  count: 10,
  speed: 1.333,
  cartChance: 5,

  zone1: {
    xMin: -6.18,
    xMax: 3.063,
    zMin: -5.823,
    zMax: 9.627,
  },

  zone2: {
    xMin: -9.607,
    xMax: -5.4,
    zMin: 9.627,
    zMax: 39.97,
  },

  corridor1: { x: 3.16, zMin: -2.037, zMax: 1.533 },
  corridor2: { x: -9.607, z: 9.627 },
  corridor3: { x: -7.047, z: 9.627 },
  gate: { x: -6.25, zMin: -5.3, zMax: -1.833 },
};

const SOUNDS = {
  
  
  lose: 'assets/sounds/loss.mp3',
  much: 'assets/sounds/much.mp3',
  background: 'assets/sounds/background.mp3',
};

const GRABABLE_PRODUCTS = [
  'chips2', 'chips3', 'drinks', 'vegetables'
];
