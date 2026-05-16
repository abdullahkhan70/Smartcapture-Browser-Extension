declare module 'fabric' {
  export namespace fabric {
    class Canvas {
      constructor(el: HTMLCanvasElement | string, options?: Record<string, any>);
      width: number;
      height: number;
      isDrawingMode: boolean;
      selection: boolean;
      defaultCursor: string;
      hoverCursor: string;
      freeDrawingBrush: any;
      backgroundColor: string;
      preserveObjectStacking: boolean;
      selectionColor: string;
      selectionBorderColor: string;
      selectionLineWidth: number;
      viewportTransform: number[] | null;

      add(...objects: any[]): any;
      remove(...objects: any[]): any;
      clear(): any;
      renderAll(): any;
      requestRenderAll(): any;
      dispose(): any;
      getActiveObject(): any;
      setActiveObject(obj: any): any;
      discardActiveObject(): any;
      getObjects(): any[];
      forEachObject(callback: (obj: any) => void): any;
      getPointer(e: any): fabric.Point;
      getCenter(): { left: number; top: number };
      getZoom(): number;
      zoomToPoint(point: fabric.Point, value: number): any;
      setViewportTransform(vpt: number[]): any;
      setDimensions(dimensions: { width: number; height: number }): any;
      setWidth(w: number): any;
      setHeight(h: number): any;
      setBackgroundImage(image: any, callback: () => void, options?: Record<string, any>): any;
      toJSON(additionalProps?: string[]): any;
      loadFromJSON(json: any, callback: () => void): any;
      toBlob(callback: (blob: any) => void, format?: string, quality?: number): any;
      on(event: string, handler: (opt: any) => void): any;
      off(event: string, handler?: (opt: any) => void): any;
    }

    class StaticCanvas {
      constructor(el: HTMLCanvasElement | string, options?: Record<string, any>);
    }

    class Object {
      id: string;
      type: string;
      left: number;
      top: number;
      width: number;
      height: number;
      scaleX: number;
      scaleY: number;
      fill: string;
      stroke: string;
      strokeWidth: number;
      opacity: number;
      selectable: boolean;
      evented: boolean;
      angle: number;
      _isBackground: boolean;
      annotationId?: string;
      annotationType?: string;

      constructor(options?: Record<string, any>);
      set(key: string | Record<string, any>, value?: any): any;
      get(key: string): any;
    }

    class Rect extends Object {
      rx?: number;
      ry?: number;
      strokeUniform?: boolean;
    }

    class Ellipse extends Object {
      rx: number;
      ry: number;
    }

    class Circle extends Object {
      radius: number;
    }

    class Line extends Object {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      constructor(points: number[] | any[], options?: Record<string, any>);
    }

    class IText extends Object {
      text: string;
      fontSize: number;
      fontFamily: string;
      fontWeight: string;
      textAlign: string;
      isEditing: boolean;
      cursorColor: string;
      editingBorderColor: string;
      constructor(text: string, options?: Record<string, any>);
      enterEditing(): void;
      exitEditing(): void;
    }

    class Text extends IText {
      constructor(text: string, options?: Record<string, any>);
    }

    class Triangle extends Object {
      width: number;
      height: number;
    }

    class Path extends Object {}

    class Group extends Object {
      _objects: any[];
      constructor(objects: any[], options?: Record<string, any>);
    }

    class Point {
      x: number;
      y: number;
      constructor(x: number, y: number);
    }

    class Image extends Object {
      static fromURL(url: string, callback: (img: Image) => void, options?: Record<string, any>): any;
    }

    interface IEvent<T = any> {
      e: T;
    }
  }
}

declare module 'pixelmatch' {
  function pixelmatch(
    img1: Uint8Array | Uint8ClampedArray,
    img2: Uint8Array | Uint8ClampedArray,
    output: Uint8Array | Uint8ClampedArray | null,
    width: number,
    height: number,
    options?: Record<string, any>
  ): number;
  export default pixelmatch;
}
