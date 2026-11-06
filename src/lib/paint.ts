// Paint (画图): the tools, colours and words shared by the page
// (src/pages/paint.astro) and the program (src/scripts/paint/).
// No Astro imports: this file is also bundled into the browser.

export interface Bi { en: string; zh: string }

export type ToolId = 'select' | 'eraser' | 'fill' | 'picker' | 'zoom' | 'pencil' | 'brush' | 'airbrush' | 'text' | 'line' | 'rect' | 'ellipse';

export interface ToolInfo {
  id: ToolId;
  icon: string;
  name: Bi;
  /** What the status bar says while you point at it or use it. */
  hint: Bi;
}

/** The tool box, in two columns, as read left to right. */
export const TOOLS: ToolInfo[] = [
  { id: 'select', icon: 'pt-select', name: { en: 'Select', zh: '选定' }, hint: { en: 'Selects a rectangle of the picture to move, copy or delete. Drag inside it to move it.', zh: '选定图片中的一个矩形区域，以便移动、复制或删除。在选定区域内拖动即可移动它。' } },
  { id: 'eraser', icon: 'pt-eraser', name: { en: 'Eraser', zh: '橡皮' }, hint: { en: 'Erases with the background colour, in the size chosen below.', zh: '用背景色擦除，大小在下面选择。' } },
  { id: 'fill', icon: 'pt-fill', name: { en: 'Fill With Color', zh: '用颜色填充' }, hint: { en: 'Fills an enclosed area with the colour.', zh: '用颜色填充一个封闭的区域。' } },
  { id: 'picker', icon: 'pt-picker', name: { en: 'Pick Color', zh: '取色' }, hint: { en: 'Picks up a colour from the picture to draw with.', zh: '从图片中取一种颜色来画。' } },
  { id: 'zoom', icon: 'pt-zoom', name: { en: 'Magnifier', zh: '放大镜' }, hint: { en: 'Click the picture to zoom in there; click again to zoom out.', zh: '单击图片即可在该处放大；再单击一次即可缩小。' } },
  { id: 'pencil', icon: 'pt-pencil', name: { en: 'Pencil', zh: '铅笔' }, hint: { en: 'Draws a hard line one pixel wide.', zh: '画一条一像素宽的硬线。' } },
  { id: 'brush', icon: 'pt-brush', name: { en: 'Brush', zh: '刷子' }, hint: { en: 'Paints with the brush chosen below. With a pen, press harder for a wider line.', zh: '用下面选择的刷子作画。用手写笔时，用力越大，线条越粗。' } },
  { id: 'airbrush', icon: 'pt-airbrush', name: { en: 'Airbrush', zh: '喷枪' }, hint: { en: 'Sprays paint. Hold still for more.', zh: '喷出颜料。停留越久，颜料越多。' } },
  { id: 'text', icon: 'pt-text', name: { en: 'Text', zh: '文字' }, hint: { en: 'Writes text: click where it should start, type, then click outside to put it down.', zh: '写文字：单击开始的位置，输入，然后在外面单击即可放下。' } },
  { id: 'line', icon: 'pt-line', name: { en: 'Line', zh: '直线' }, hint: { en: 'Draws a straight line. Hold Shift for exact angles.', zh: '画一条直线。按住 Shift 键可画出准确的角度。' } },
  { id: 'rect', icon: 'pt-rect', name: { en: 'Rectangle', zh: '矩形' }, hint: { en: 'Draws a rectangle in the fill style chosen below. Hold Shift for a square.', zh: '用下面选择的填充样式画矩形。按住 Shift 键可画正方形。' } },
  { id: 'ellipse', icon: 'pt-ellipse', name: { en: 'Ellipse', zh: '椭圆' }, hint: { en: 'Draws an ellipse in the fill style chosen below. Hold Shift for a circle.', zh: '用下面选择的填充样式画椭圆。按住 Shift 键可画圆。' } },
];

/** The colour box: 2 rows of 14, the Windows 98 defaults. */
export const PALETTE = [
  '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
  '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040',
];

/** Colour names (screen readers and tooltips), in palette order. */
export const COLOR_NAMES: Bi[] = [
  { en: 'Black', zh: '黑色' }, { en: 'Grey', zh: '灰色' }, { en: 'Maroon', zh: '褐红色' }, { en: 'Olive', zh: '橄榄色' },
  { en: 'Green', zh: '绿色' }, { en: 'Teal', zh: '青色' }, { en: 'Navy', zh: '藏青色' }, { en: 'Purple', zh: '紫色' },
  { en: 'Khaki', zh: '卡其色' }, { en: 'Dark slate', zh: '深青灰色' }, { en: 'Sky blue', zh: '天蓝色' }, { en: 'Steel blue', zh: '钢蓝色' },
  { en: 'Violet', zh: '紫罗兰色' }, { en: 'Brown', zh: '棕色' },
  { en: 'White', zh: '白色' }, { en: 'Silver', zh: '银色' }, { en: 'Red', zh: '红色' }, { en: 'Yellow', zh: '黄色' },
  { en: 'Lime', zh: '亮绿色' }, { en: 'Aqua', zh: '水绿色' }, { en: 'Blue', zh: '蓝色' }, { en: 'Fuchsia', zh: '紫红色' },
  { en: 'Pale yellow', zh: '浅黄色' }, { en: 'Spring green', zh: '春绿色' }, { en: 'Pale aqua', zh: '浅水绿色' }, { en: 'Periwinkle', zh: '长春花色' },
  { en: 'Rose', zh: '玫瑰红色' }, { en: 'Orange', zh: '橙色' },
];

export type BrushShape = 'round' | 'square' | 'slash' | 'backslash';
/** The brush choices: three sizes of each shape (pixels across). */
export const BRUSHES: { shape: BrushShape; size: number }[] = (['round', 'square', 'slash', 'backslash'] as const).flatMap((shape) =>
  [3, 7, 14].map((size) => ({ shape, size })),
);
export const ERASER_SIZES = [6, 10, 16, 28];
export const AIRBRUSH_SIZES = [8, 14, 24];
export const LINE_WIDTHS = [1, 2, 3, 5, 8];
export const ZOOMS = [1, 2, 4, 6, 8];
export type FillStyle = 'outline' | 'both' | 'solid';
export const FILL_STYLES: FillStyle[] = ['outline', 'both', 'solid'];

/** Fonts for the Text tool (the first one is the house's Times New Roman). */
export const FONTS: { id: string; css: string; name: Bi }[] = [
  { id: 'serif', css: '"Times New Roman", Times, "Songti SC", SimSun, serif', name: { en: 'Times New Roman', zh: 'Times New Roman（宋体）' } },
  { id: 'system', css: '"Pixelated MS Sans Serif", Tahoma, "Microsoft YaHei", "PingFang SC", sans-serif', name: { en: 'Sans Serif', zh: '无衬线（黑体）' } },
  { id: 'mono', css: '"Courier New", Courier, "STFangsong", FangSong, monospace', name: { en: 'Courier New', zh: 'Courier New（仿宋）' } },
  { id: 'hand', css: '"Comic Sans MS", "Comic Sans", "Kaiti SC", KaiTi, "STKaiti", cursive', name: { en: 'Comic (handwriting)', zh: '手写（楷体）' } },
];
export const FONT_SIZES = [12, 16, 20, 28, 40, 56, 72];

/** Largest picture side, in pixels (the Worker refuses more: worker/drawing.ts). */
export const MAX_SIDE = 2400;
/** Largest PNG the Worker takes. */
export const MAX_BYTES = 2 * 1024 * 1024;
export const SEND_ENDPOINT = '/v1/contact/drawing';
export const TURNSTILE_ACTION = 'kuschonink-drawing';
