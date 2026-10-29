import { requireOptionalNativeModule } from 'expo';

type CarPuckNative = {
  setModelPuck(viewTag: number, uri: string, scale: number, rotation: number): Promise<boolean>;
  addModel(viewTag: number, modelId: string, uri: string): Promise<boolean>;
};

// Solo existe en Android; en iOS y web se queda el indicador 2D.
const native = requireOptionalNativeModule<CarPuckNative>('CarPuck');

export function setModelPuck(viewTag: number, uri: string, scale: number, rotation: number) {
  if (!native) return Promise.resolve(false);
  return native.setModelPuck(viewTag, uri, scale, rotation).catch((error: unknown) => {
    console.warn('[car-puck]', error instanceof Error ? error.message : String(error));
    return false;
  });
}

export function addModel(viewTag: number, modelId: string, uri: string) {
  if (!native) return Promise.resolve(false);
  return native.addModel(viewTag, modelId, uri).catch(() => false);
}
