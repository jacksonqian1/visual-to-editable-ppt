const state = {
  project: null,
  selectedId: null,
  zoom: 1,
  history: [],
  historyIndex: -1,
  saveTimer: null,
  dragging: null
};

const ui = {
  canvas: document.getElementById("slide-canvas"),
  shell: document.getElementById("canvas-shell"),
  layers: document.getElementById("layers"),
  inspector: document.getElementById("inspector"),
  selectionType: document.getElementById("selection-type"),
  elementCount: document.getElementById("element-count"),
  saveStatus: document.getElementById("save-status"),
  overlayVisible: document.getElementById("overlay-visible"),
  overlayOpacity: document.getElementById("overlay-opacity"),
  zoom: document.getElementById("zoom"),
  uploadIconInput: document.getElementById("upload-icon-input"),
  toast: document.getElementById("toast")
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));
const selected = () => state.project?.elements.find((element) => element.id === state.selectedId) || null;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

async function loadProject() {
  const response = await fetch("/api/project");
  if (!response.ok) throw new Error(await response.text());
  state.project = await response.json();
  state.project.elements ||= [];
  normalizeProject();
  pushHistory(true);
  ui.overlayVisible.checked = Boolean(state.project.sourceImage?.visible);
  ui.overlayOpacity.value = state.project.sourceImage?.opacity ?? 0.25;
  render();
  setSaveStatus(state.project.status === "confirmed" ? "已确认" : "已载入");
}

function normalizeProject() {
  const ids = new Set();
  state.project.elements.forEach((element, index) => {
    if (!element.id || ids.has(element.id)) element.id = uniqueId(element.type || "element");
    ids.add(element.id);
    element.name ||= `${element.type || "element"} ${index + 1}`;
    element.visible = element.visible !== false;
    element.locked = Boolean(element.locked);
    element.z = number(element.z, index);
    if (element.type === "line") {
      element.x1 = number(element.x1);
      element.y1 = number(element.y1);
      element.x2 = number(element.x2, element.x1 + 100);
      element.y2 = number(element.y2, element.y1);
    } else {
      element.x = number(element.x);
      element.y = number(element.y);
      element.width = Math.max(1, number(element.width, 100));
      element.height = Math.max(1, number(element.height, 40));
      element.rotation = number(element.rotation);
      if (element.type === "roundRect") {
        const fallback = Math.max(0, number(element.radius, 8));
        element.radiusTopLeft = Math.max(0, number(element.radiusTopLeft, fallback));
        element.radiusTopRight = Math.max(0, number(element.radiusTopRight, fallback));
        element.radiusBottomRight = Math.max(0, number(element.radiusBottomRight, fallback));
        element.radiusBottomLeft = Math.max(0, number(element.radiusBottomLeft, fallback));
      }
    }
  });
}

function borderRadiusValue(element) {
  if (element.type === "ellipse") return "50%";
  if (element.type !== "roundRect") return "0";
  const fallback = Math.max(0, number(element.radius, 8));
  return [
    number(element.radiusTopLeft, fallback),
    number(element.radiusTopRight, fallback),
    number(element.radiusBottomRight, fallback),
    number(element.radiusBottomLeft, fallback)
  ].map((value) => `${Math.max(0, value)}px`).join(" ");
}

function uniqueId(prefix) {
  const clean = String(prefix || "element").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "element";
  let id;
  do id = `${clean}-${Math.random().toString(36).slice(2, 8)}`;
  while (state.project?.elements.some((element) => element.id === id));
  return id;
}

function render() {
  if (!state.project) return;
  const { width, height, background } = state.project.canvas;
  ui.canvas.style.width = `${width}px`;
  ui.canvas.style.height = `${height}px`;
  ui.canvas.style.background = background || "#ffffff";
  ui.canvas.style.transform = `scale(${state.zoom})`;
  ui.shell.style.width = `${width * state.zoom}px`;
  ui.shell.style.height = `${height * state.zoom}px`;
  ui.canvas.innerHTML = "";

  const source = state.project.sourceImage;
  if (source?.visible && source.src) {
    const image = document.createElement("img");
    image.className = "source-overlay";
    image.src = source.src;
    image.style.opacity = String(source.opacity ?? 0.25);
    ui.canvas.appendChild(image);
  }

  [...state.project.elements]
    .filter((element) => element.visible !== false)
    .sort((a, b) => number(a.z) - number(b.z))
    .forEach(renderElement);

  renderSelectionHandles();
  renderLayers();
  renderInspector();
  ui.elementCount.textContent = String(state.project.elements.length);
}

function renderElement(element) {
  let node;
  if (element.type === "path") {
    const ns = 'http://www.w3.org/2000/svg';
    node = document.createElementNS(ns, 'svg');
    node.classList.add('scene-element');
    Object.assign(node.style, {left:`${element.x}px`, top:`${element.y}px`, width:`${element.width}px`, height:`${element.height}px`, overflow:'visible', transform:`rotate(${element.rotation || 0}deg)`});
    node.setAttribute('viewBox', `0 0 ${element.pathWidth || element.width} ${element.pathHeight || element.height}`);
    node.setAttribute('preserveAspectRatio','none');
    const d = element.pathPoints.map((p,i) => !i ? `M ${p.x} ${p.y}` : p.curve ? `C ${p.curve.x1} ${p.curve.y1} ${p.curve.x2} ${p.curve.y2} ${p.x} ${p.y}` : `L ${p.x} ${p.y}`).join(' ');
    const pathNode = document.createElementNS(ns,'path');
    pathNode.setAttribute('d', d); pathNode.setAttribute('fill','none'); pathNode.setAttribute('stroke',element.stroke || '#111'); pathNode.setAttribute('stroke-width',element.strokeWidth || 1); pathNode.setAttribute('vector-effect','non-scaling-stroke');
    if (element.dash === 'dash') pathNode.setAttribute('stroke-dasharray','6 4');
    const defs = document.createElementNS(ns,'defs'); const marker = document.createElementNS(ns,'marker');
    const mid = `editor-arrow-${element.id}`;
    Object.entries({id:mid,markerWidth:'7',markerHeight:'7',refX:'6',refY:'3.5',orient:'auto-start-reverse',markerUnits:'strokeWidth'}).forEach(([k,v])=>marker.setAttribute(k,v));
    const triangle=document.createElementNS(ns,'path');triangle.setAttribute('d','M0 0 L7 3.5 L0 7 Z');triangle.setAttribute('fill',element.stroke || '#111');marker.appendChild(triangle);defs.appendChild(marker);node.appendChild(defs);
    if(element.startArrow && element.startArrow !== 'none') pathNode.setAttribute('marker-start',`url(#${mid})`);
    if(element.endArrow && element.endArrow !== 'none') pathNode.setAttribute('marker-end',`url(#${mid})`);
    node.appendChild(pathNode);
  } else if (element.type === "line") {
    node = document.createElement("div");
    const dx = element.x2 - element.x1;
    const dy = element.y2 - element.y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    node.className = "scene-line";
    node.style.left = `${element.x1}px`;
    node.style.top = `${element.y1}px`;
    node.style.width = `${length}px`;
    node.style.borderTop = `${element.strokeWidth || 2}px ${element.dash === "dash" ? "dashed" : "solid"} ${element.stroke || "#111"}`;
    node.style.color = element.stroke || "#111";
    node.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
    node.style.setProperty("--end-arrow-display", element.endArrow && element.endArrow !== "none" ? "block" : "none");
  } else if (element.type === "image") {
    node = document.createElement("img");
    node.className = "scene-element scene-image";
    node.src = element.src || "";
    node.style.objectFit = element.fit || "contain";
    Object.assign(node.style, {
      left: `${element.x}px`,
      top: `${element.y}px`,
      width: `${element.width}px`,
      height: `${element.height}px`,
      transform: `rotate(${element.rotation || 0}deg)`
    });
  } else {
    node = document.createElement("div");
    node.className = `scene-element scene-${element.type}`;
    if (element.type === "text" || element.type === "icon") {
      node.textContent = element.type === "text" ? element.text || "" : element.glyph || "◎";
      Object.assign(node.style, {
        fontFamily: element.fontFamily || "PingFang SC",
        fontSize: `${element.fontSize || 16}px`,
        fontWeight: String(element.fontWeight || 400),
        color: element.color || "#111111",
        textAlign: element.align || "left",
        lineHeight: String(element.lineHeight || 1.2)
      });
    } else {
      Object.assign(node.style, {
        background: element.fill || "transparent",
        border: `${element.strokeWidth || 0}px solid ${element.stroke || "transparent"}`,
        borderRadius: borderRadiusValue(element)
      });
    }
    Object.assign(node.style, {
      left: `${element.x}px`,
      top: `${element.y}px`,
      width: `${element.width}px`,
      height: `${element.height}px`,
      transform: `rotate(${element.rotation || 0}deg)`
    });
  }

  node.dataset.id = element.id;
  node.style.zIndex = String(number(element.z));
  if (element.locked) node.classList.add("locked");
  if (element.id === state.selectedId) node.classList.add("selected");
  node.addEventListener("pointerdown", (event) => beginDrag(event, element, "move"));
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    selectElement(element.id);
  });
  if (element.type === "text") {
    node.addEventListener("dblclick", (event) => beginTextEdit(event, element, node));
  }
  ui.canvas.appendChild(node);
}

function renderSelectionHandles() {
  const element = selected();
  if (!element || element.locked || element.visible === false) return;
  if (element.type === "line") {
    [
      ["start", element.x1, element.y1],
      ["end", element.x2, element.y2]
    ].forEach(([kind, x, y]) => {
      const handle = document.createElement("div");
      handle.className = "selection-handle line-handle";
      handle.style.left = `${x - 5}px`;
      handle.style.top = `${y - 5}px`;
      handle.addEventListener("pointerdown", (event) => beginDrag(event, element, kind));
      ui.canvas.appendChild(handle);
    });
    return;
  }
  const handle = document.createElement("div");
  handle.className = "selection-handle resize-handle";
  handle.style.left = `${element.x + element.width - 5}px`;
  handle.style.top = `${element.y + element.height - 5}px`;
  handle.addEventListener("pointerdown", (event) => beginDrag(event, element, "resize"));
  ui.canvas.appendChild(handle);
}

function renderLayers() {
  ui.layers.innerHTML = "";
  [...state.project.elements]
    .sort((a, b) => number(b.z) - number(a.z))
    .forEach((element) => {
      const row = document.createElement("button");
      row.className = `layer-row${element.id === state.selectedId ? " selected" : ""}`;
      row.innerHTML = `<span class="layer-type">${typeSymbol(element.type)}</span><span class="layer-name"></span><span class="layer-lock">${element.locked ? "⌑" : ""}</span>`;
      row.querySelector(".layer-name").textContent = element.overlapGroup
        ? `${element.name} [${element.overlapGroup}]`
        : element.name;
      row.addEventListener("click", () => selectElement(element.id));
      ui.layers.appendChild(row);
    });
}

function typeSymbol(type) {
  return ({ text: "T", icon: "◎", line: "╱", image: "▧", rect: "□", roundRect: "▢", ellipse: "○" })[type] || "·";
}

function selectElement(id) {
  state.selectedId = id;
  render();
}

function canvasPoint(event) {
  const rect = ui.canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / state.zoom,
    y: (event.clientY - rect.top) / state.zoom
  };
}

function beginDrag(event, element, mode) {
  event.preventDefault();
  event.stopPropagation();
  selectElement(element.id);
  if (element.locked) return;
  state.dragging = {
    id: element.id,
    mode,
    start: canvasPoint(event),
    original: deepClone(element)
  };
  window.addEventListener("pointermove", onDrag);
  window.addEventListener("pointerup", endDrag, { once: true });
}

function onDrag(event) {
  if (!state.dragging) return;
  const element = state.project.elements.find((item) => item.id === state.dragging.id);
  const point = canvasPoint(event);
  const dx = point.x - state.dragging.start.x;
  const dy = point.y - state.dragging.start.y;
  const original = state.dragging.original;
  if (state.dragging.mode === "move") {
    if (element.type === "line") {
      element.x1 = original.x1 + dx;
      element.y1 = original.y1 + dy;
      element.x2 = original.x2 + dx;
      element.y2 = original.y2 + dy;
    } else {
      element.x = original.x + dx;
      element.y = original.y + dy;
    }
  } else if (state.dragging.mode === "resize") {
    element.width = Math.max(8, original.width + dx);
    element.height = Math.max(8, original.height + dy);
  } else if (state.dragging.mode === "start") {
    element.x1 = original.x1 + dx;
    element.y1 = original.y1 + dy;
  } else if (state.dragging.mode === "end") {
    element.x2 = original.x2 + dx;
    element.y2 = original.y2 + dy;
  }
  render();
}

function endDrag() {
  window.removeEventListener("pointermove", onDrag);
  if (state.dragging) {
    state.dragging = null;
    commitChange();
  }
}

function beginTextEdit(event, element, node) {
  if (element.locked) return;
  event.stopPropagation();
  node.contentEditable = "true";
  node.style.userSelect = "text";
  node.style.cursor = "text";
  node.focus();
  document.execCommand("selectAll", false, null);
  const finish = () => {
    node.contentEditable = "false";
    element.text = node.innerText;
    commitChange();
    render();
  };
  node.addEventListener("blur", finish, { once: true });
  node.addEventListener("keydown", (keyEvent) => {
    if (keyEvent.key === "Escape") node.blur();
    keyEvent.stopPropagation();
  });
}

function renderInspector() {
  const element = selected();
  if (!element) {
    ui.selectionType.textContent = "未选择";
    ui.inspector.innerHTML = '<p class="empty-state">选择画布或图层中的对象进行编辑。</p>';
    return;
  }
  ui.selectionType.textContent = element.type;
  ui.inspector.innerHTML = "";
  ui.inspector.appendChild(group("对象", [
    field("名称", "name", element.name, "text", true),
    field("图层", "z", element.z, "number"),
    field("可见", "visible", element.visible, "checkbox"),
    field("锁定", "locked", element.locked, "checkbox")
  ]));

  if (element.type === "line") {
    ui.inspector.appendChild(group("端点", [
      field("X1", "x1", element.x1, "number"),
      field("Y1", "y1", element.y1, "number"),
      field("X2", "x2", element.x2, "number"),
      field("Y2", "y2", element.y2, "number")
    ]));
    ui.inspector.appendChild(group("线条", [
      field("颜色", "stroke", element.stroke || "#111111", "color"),
      field("粗细", "strokeWidth", element.strokeWidth || 2, "number"),
      selectField("样式", "dash", element.dash || "solid", [["solid", "实线"], ["dash", "虚线"]]),
      selectField("终点箭头", "endArrow", element.endArrow || "none", [["none", "无"], ["triangle", "箭头"]])
    ]));
  } else {
    ui.inspector.appendChild(group("位置与尺寸", [
      field("X", "x", element.x, "number"),
      field("Y", "y", element.y, "number"),
      field("宽", "width", element.width, "number"),
      field("高", "height", element.height, "number"),
      field("旋转", "rotation", element.rotation || 0, "number")
    ]));
  }

  if (element.type === "path") {
    ui.inspector.appendChild(group("连续曲线", [
      field("颜色", "stroke", element.stroke || "#111111", "color"),
      field("粗细", "strokeWidth", element.strokeWidth || 1, "number"),
      selectField("起点箭头", "startArrow", element.startArrow || "none", [["none", "无"], ["triangle", "箭头"]]),
      selectField("终点箭头", "endArrow", element.endArrow || "none", [["none", "无"], ["triangle", "箭头"]])
    ]));
    element.pathPoints.forEach((point,i) => {
      const fields = [field("端点 X", `pathPoints.${i}.x`, point.x, "number"),field("端点 Y", `pathPoints.${i}.y`, point.y, "number")];
      if(point.curve) for(const key of ['x1','y1','x2','y2']) fields.push(field(`控制点 ${key}`, `pathPoints.${i}.curve.${key}`, point.curve[key], 'number'));
      ui.inspector.appendChild(group(`曲线路径点 ${i+1}`, fields));
    });
  }
  if (element.type === "text") {
    ui.inspector.appendChild(group("文字", [
      field("内容", "text", element.text || "", "textarea", true),
      field("字体", "fontFamily", element.fontFamily || "PingFang SC", "text", true),
      field("字号", "fontSize", element.fontSize || 16, "number"),
      field("字重", "fontWeight", element.fontWeight || 400, "number"),
      field("颜色", "color", element.color || "#111111", "color"),
      selectField("对齐", "align", element.align || "left", [["left", "左"], ["center", "中"], ["right", "右"]])
    ]));
  } else if (element.type === "icon") {
    const wrapper = group("图标", [
      field("字符", "glyph", element.glyph || "◎", "text", true),
      field("字号", "fontSize", element.fontSize || 36, "number"),
      field("颜色", "color", element.color || "#c40000", "color")
    ]);
    wrapper.querySelector(".field-grid").appendChild(uploadField("上传替换", async (file) => {
      await convertElementToUploadedIcon(element, file);
    }));
    ui.inspector.appendChild(wrapper);
  } else if (element.type === "image") {
    const wrapper = group("图片", [
      field("路径或 Data URL", "src", element.src || "", "textarea", true),
      selectField("适配", "fit", element.fit || "contain", [["contain", "完整显示"], ["cover", "裁切填充"], ["fill", "拉伸"]])
    ]);
    wrapper.querySelector(".field-grid").appendChild(uploadField("替换图片", async (file) => {
      element.src = await fileToDataUrl(file);
      commitChange();
      render();
    }));
    ui.inspector.appendChild(wrapper);
  } else if (["rect", "roundRect", "ellipse"].includes(element.type)) {
    ui.inspector.appendChild(group("形状", [
      field("填充", "fill", element.fill || "#ffffff", "color"),
      field("边框", "stroke", element.stroke || "#df3030", "color"),
      field("边框粗细", "strokeWidth", element.strokeWidth || 1, "number"),
      ...(element.type === "roundRect" ? [
        field("左上圆角", "radiusTopLeft", element.radiusTopLeft, "number"),
        field("右上圆角", "radiusTopRight", element.radiusTopRight, "number"),
        field("右下圆角", "radiusBottomRight", element.radiusBottomRight, "number"),
        field("左下圆角", "radiusBottomLeft", element.radiusBottomLeft, "number")
      ] : []),
      ...(element.type === "rect" ? [
        field("布尔组", "mergeGroup", element.mergeGroup || "", "text", true),
        selectField("图形运算", "mergeOperation", element.mergeOperation || "none", [
          ["none", "无"],
          ["union", "联合"],
          ["intersect", "相交"],
          ["subtract", "相减"]
        ]),
        field("自动合并", "autoMerge", element.autoMerge, "checkbox")
      ] : [])
    ]));
  }

  if (["line", "rect", "roundRect", "ellipse"].includes(element.type)) {
    ui.inspector.appendChild(group("交叉与重叠", [
      field("交叉组", "overlapGroup", element.overlapGroup || "", "text", true),
      selectField("关系", "overlapKind", element.overlapKind || "none", [
        ["none", "无"],
        ["crossing", "交叉"],
        ["overlap", "重叠"],
        ["tangent", "相切"]
      ]),
      selectField("层级角色", "overlapRole", element.overlapRole || "member", [
        ["member", "成员"],
        ["foreground", "前景"],
        ["background", "背景"]
      ])
    ]));
  }

  if (["icon", "line", "image"].includes(element.type)) {
    ui.inspector.appendChild(libraryPanel(element));
  }

  const actions = document.createElement("div");
  actions.className = "inspector-actions";
  actions.innerHTML = '<button data-action="down">下移</button><button data-action="up">上移</button><button data-action="duplicate">复制</button>';
  actions.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (action === "up") element.z = number(element.z) + 1;
    if (action === "down") element.z = number(element.z) - 1;
    if (action === "duplicate") duplicateSelected();
    commitChange();
    render();
  });
  ui.inspector.appendChild(actions);

  ui.inspector.querySelectorAll("[data-key]").forEach((input) => {
    const applyValue = () => {
      const current = selected();
      const key = input.dataset.key;
      const keys = key.split('.'); let target = current;
      for(const part of keys.slice(0,-1)) target = target[part];
      target[keys[keys.length-1]] = input.type === "checkbox" ? input.checked : input.type === "number" ? number(input.value) : input.value;
      state.project.status = "draft";
      scheduleSave();
    };
    input.addEventListener("input", applyValue);
    input.addEventListener("change", () => {
      applyValue();
      pushHistory();
      render();
    });
  });
}

function group(title, fields) {
  const section = document.createElement("section");
  section.className = "field-group";
  const heading = document.createElement("h3");
  heading.className = "field-title";
  heading.textContent = title;
  const grid = document.createElement("div");
  grid.className = "field-grid";
  fields.forEach((item) => grid.appendChild(item));
  section.append(heading, grid);
  return section;
}

function field(label, key, value, type = "text", full = false) {
  const wrapper = document.createElement("div");
  wrapper.className = `field${full ? " full" : ""}`;
  const labelNode = document.createElement("label");
  labelNode.textContent = label;
  const input = document.createElement(type === "textarea" ? "textarea" : "input");
  input.dataset.key = key;
  input.type = type === "textarea" ? undefined : type;
  if (type === "checkbox") input.checked = Boolean(value);
  else input.value = value ?? "";
  wrapper.append(labelNode, input);
  return wrapper;
}

function selectField(label, key, value, options) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const labelNode = document.createElement("label");
  labelNode.textContent = label;
  const select = document.createElement("select");
  select.dataset.key = key;
  options.forEach(([optionValue, textValue]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = textValue;
    option.selected = optionValue === value;
    select.appendChild(option);
  });
  wrapper.append(labelNode, select);
  return wrapper;
}

function uploadField(label, onFile) {
  const wrapper = document.createElement("div");
  wrapper.className = "field full";
  const labelNode = document.createElement("label");
  labelNode.textContent = label;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
  input.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    await onFile(file);
    input.value = "";
  });
  wrapper.append(labelNode, input);
  return wrapper;
}

function libraryKind(element) {
  if (element.type === "line") {
    return element.endArrow && element.endArrow !== "none" ? "arrow" : "line";
  }
  return element.libraryAsset?.kind || "icon";
}

function lineDirection(element) {
  const dx = number(element.x2) - number(element.x1);
  const dy = number(element.y2) - number(element.y1);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right 向右" : "left 向左";
  return dy >= 0 ? "down 向下" : "up 向上";
}

function defaultLibraryQuery(element) {
  if (element.libraryQuery) return element.libraryQuery;
  const parts = [element.name || element.id || ""];
  if (element.type === "line") {
    parts.push(element.endArrow && element.endArrow !== "none" ? "arrow 箭头" : "line 线条");
    parts.push(lineDirection(element));
  }
  return parts.join(" ").trim();
}

function libraryPanel(element) {
  const section = document.createElement("section");
  section.className = "field-group";
  const heading = document.createElement("h3");
  heading.className = "field-title";
  heading.textContent = "本地图标库";
  const controls = document.createElement("div");
  controls.className = "library-controls";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "名称、标签或别名";
  input.value = defaultLibraryQuery(element);
  const search = document.createElement("button");
  search.type = "button";
  search.textContent = "搜索";
  const status = document.createElement("p");
  status.className = "library-status";
  status.textContent = "正在读取图标库…";
  const grid = document.createElement("div");
  grid.className = "library-grid";
  controls.append(input, search);
  section.append(heading, controls, status, grid);

  const runSearch = () => loadLibraryMatches(element.id, input.value, status, grid);
  search.addEventListener("click", runSearch);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  });
  queueMicrotask(runSearch);
  return section;
}

async function loadLibraryMatches(elementId, query, status, grid) {
  const element = state.project.elements.find((item) => item.id === elementId);
  if (!element) return;
  status.textContent = "正在匹配…";
  grid.innerHTML = "";
  try {
    const params = new URLSearchParams({
      query,
      kind: libraryKind(element),
      limit: "18"
    });
    const response = await fetch(`/api/icon-library?${params}`);
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    if (!result.configured) {
      status.textContent = "尚未为项目配置本地图标库。";
      return;
    }
    status.textContent = result.matches.length
      ? `共 ${result.count} 个资源，显示 ${result.matches.length} 个候选`
      : `图标库含 ${result.count} 个资源，没有可靠候选`;
    for (const asset of result.matches) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "library-asset";
      button.title = `${asset.name} · 匹配分 ${asset.score}`;
      const image = document.createElement("img");
      image.src = asset.thumbnail;
      image.alt = "";
      const label = document.createElement("span");
      label.textContent = asset.name;
      button.append(image, label);
      button.addEventListener("click", () => applyLibraryAsset(elementId, asset, query));
      grid.appendChild(button);
    }
  } catch (error) {
    status.textContent = "图标库读取失败";
    showToast(error.message);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function applyLibraryAsset(elementId, asset, query) {
  const element = state.project.elements.find((item) => item.id === elementId);
  if (!element) return;
  const response = await fetch(asset.thumbnail);
  if (!response.ok) throw new Error(await response.text());
  const src = await blobToDataUrl(await response.blob());
  if (element.type === "line") {
    const x1 = number(element.x1);
    const y1 = number(element.y1);
    const x2 = number(element.x2);
    const y2 = number(element.y2);
    const dx = x2 - x1;
    const dy = y2 - y1;
    element.originalLine = {
      x1, y1, x2, y2,
      stroke: element.stroke,
      strokeWidth: element.strokeWidth,
      dash: element.dash,
      startArrow: element.startArrow,
      endArrow: element.endArrow
    };
    element.x = Math.min(x1, x2);
    element.y = Math.min(y1, y2);
    element.width = Math.max(24, Math.abs(dx));
    element.height = Math.max(24, Math.abs(dy));
    element.rotation = 0;
    delete element.x1;
    delete element.y1;
    delete element.x2;
    delete element.y2;
    delete element.stroke;
    delete element.strokeWidth;
    delete element.dash;
    delete element.startArrow;
    delete element.endArrow;
  }
  element.type = "image";
  element.src = src;
  element.fit = "contain";
  element.placeholder = false;
  element.libraryUnmatched = false;
  element.libraryQuery = query;
  element.libraryAsset = {
    id: asset.id,
    relative_path: asset.relative_path,
    name: asset.name,
    kind: asset.kind,
    tags: asset.tags,
    aliases: asset.aliases,
    score: asset.score
  };
  delete element.glyph;
  delete element.fontFamily;
  delete element.fontSize;
  delete element.fontWeight;
  delete element.color;
  delete element.align;
  commitChange();
  render();
  showToast(`已使用图标库资源：${asset.name}`);
}

async function autoChooseLibraryAsset(element = selected()) {
  if (!element || !["icon", "line", "image"].includes(element.type)) {
    showToast("请先选择线条、箭头或图标");
    return;
  }
  const query = defaultLibraryQuery(element);
  const params = new URLSearchParams({
    query,
    kind: libraryKind(element),
    limit: "1"
  });
  const response = await fetch(`/api/icon-library?${params}`);
  if (!response.ok) throw new Error(await response.text());
  const result = await response.json();
  if (!result.configured) {
    showToast("当前项目尚未配置本地图标库");
    return;
  }
  const asset = result.matches[0];
  const threshold = number(state.project.iconLibrary?.threshold, 35);
  if (!asset || number(asset.score) < threshold) {
    element.placeholder = true;
    element.libraryQuery = query;
    element.libraryUnmatched = true;
    commitChange();
    render();
    showToast("没有达到置信度阈值的图标，已保留占位");
    return;
  }
  await applyLibraryAsset(element.id, asset, query);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function addUploadedIcon(file) {
  const src = await fileToDataUrl(file);
  const z = Math.max(0, ...state.project.elements.map((element) => number(element.z))) + 1;
  const element = {
    id: uniqueId("icon-image"),
    name: file.name.replace(/\.[^.]+$/, "") || "上传图标",
    type: "image",
    src,
    fit: "contain",
    x: 180,
    y: 140,
    width: 96,
    height: 96,
    rotation: 0,
    visible: true,
    locked: false,
    z
  };
  state.project.elements.push(element);
  state.selectedId = element.id;
  commitChange();
  render();
}

async function convertElementToUploadedIcon(element, file) {
  element.type = "image";
  element.src = await fileToDataUrl(file);
  element.fit = "contain";
  delete element.glyph;
  delete element.fontFamily;
  delete element.fontSize;
  delete element.fontWeight;
  delete element.color;
  delete element.align;
  commitChange();
  render();
}

function addElement(type) {
  const z = Math.max(0, ...state.project.elements.map((element) => number(element.z))) + 1;
  const common = { id: uniqueId(type), name: `新建${typeSymbol(type)}`, type, visible: true, locked: false, z };
  let element;
  if (type === "line") {
    element = { ...common, x1: 180, y1: 180, x2: 420, y2: 180, stroke: "#c40000", strokeWidth: 2, dash: "solid", endArrow: "none" };
  } else {
    element = { ...common, x: 180, y: 140, width: 220, height: 70, rotation: 0 };
    if (type === "text") Object.assign(element, { text: "新建文本", fontFamily: "PingFang SC", fontSize: 32, fontWeight: 700, color: "#111111", align: "left", lineHeight: 1.2 });
    if (type === "icon") Object.assign(element, { glyph: "◎", fontFamily: "Arial", fontSize: 42, fontWeight: 700, color: "#c40000", align: "center", width: 70, height: 70 });
    if (type === "roundRect") Object.assign(element, {
      fill: "#fff7f7",
      stroke: "#df3030",
      strokeWidth: 1,
      radiusTopLeft: 8,
      radiusTopRight: 8,
      radiusBottomRight: 8,
      radiusBottomLeft: 8
    });
  }
  state.project.elements.push(element);
  state.selectedId = element.id;
  commitChange();
  render();
}

function deleteSelected() {
  if (!state.selectedId) return;
  state.project.elements = state.project.elements.filter((element) => element.id !== state.selectedId);
  state.selectedId = null;
  commitChange();
  render();
}

function duplicateSelected() {
  const element = selected();
  if (!element) return;
  const copy = deepClone(element);
  copy.id = uniqueId(element.type);
  copy.name = `${element.name} 副本`;
  copy.z = number(element.z) + 1;
  if (copy.type === "line") {
    copy.x1 += 16; copy.y1 += 16; copy.x2 += 16; copy.y2 += 16;
  } else {
    copy.x += 16; copy.y += 16;
  }
  state.project.elements.push(copy);
  state.selectedId = copy.id;
}

function commitChange() {
  state.project.status = "draft";
  pushHistory();
  scheduleSave();
}

function pushHistory(reset = false) {
  if (reset) {
    state.history = [deepClone(state.project)];
    state.historyIndex = 0;
    return;
  }
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(deepClone(state.project));
  state.historyIndex = state.history.length - 1;
  if (state.history.length > 80) {
    state.history.shift();
    state.historyIndex--;
  }
}

function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  state.project = deepClone(state.history[state.historyIndex]);
  scheduleSave();
  render();
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  state.project = deepClone(state.history[state.historyIndex]);
  scheduleSave();
  render();
}

function scheduleSave() {
  setSaveStatus("保存中");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveProject, 250);
}

async function saveProject() {
  try {
    const response = await fetch("/api/project", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state.project)
    });
    if (!response.ok) throw new Error(await response.text());
    setSaveStatus(state.project.status === "confirmed" ? "已确认并保存" : "已自动保存");
  } catch (error) {
    setSaveStatus("保存失败");
    showToast(error.message);
  }
}

function setSaveStatus(text) {
  ui.saveStatus.textContent = text;
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => ui.toast.classList.remove("show"), 2200);
}

async function confirmProject() {
  state.project.status = "confirmed";
  pushHistory();
  await saveProject();
  showToast("设计已确认，可以导出 PPT");
  render();
}

ui.canvas.addEventListener("pointerdown", () => {
  state.selectedId = null;
  render();
});
document.getElementById("undo").addEventListener("click", undo);
document.getElementById("redo").addEventListener("click", redo);
document.getElementById("add-text").addEventListener("click", () => addElement("text"));
document.getElementById("add-shape").addEventListener("click", () => addElement("roundRect"));
document.getElementById("add-line").addEventListener("click", () => addElement("line"));
document.getElementById("add-icon").addEventListener("click", () => addElement("icon"));
document.getElementById("upload-icon").addEventListener("click", () => ui.uploadIconInput.click());
ui.uploadIconInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  await addUploadedIcon(file);
  ui.uploadIconInput.value = "";
});
document.getElementById("library-auto").addEventListener("click", () => {
  autoChooseLibraryAsset().catch((error) => showToast(error.message));
});
document.getElementById("delete").addEventListener("click", deleteSelected);
document.getElementById("confirm").addEventListener("click", confirmProject);
ui.zoom.addEventListener("change", () => {
  state.zoom = number(ui.zoom.value, 1);
  render();
});
ui.overlayVisible.addEventListener("change", () => {
  state.project.sourceImage ||= {};
  state.project.sourceImage.visible = ui.overlayVisible.checked;
  commitChange();
  render();
});
ui.overlayOpacity.addEventListener("input", () => {
  state.project.sourceImage ||= {};
  state.project.sourceImage.opacity = number(ui.overlayOpacity.value, 0.25);
  render();
  scheduleSave();
});

window.addEventListener("keydown", (event) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
  } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicateSelected();
    commitChange();
    render();
  } else if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelected();
  }
});

loadProject().catch((error) => {
  setSaveStatus("载入失败");
  showToast(error.message);
});
