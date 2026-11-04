import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {VRMLoaderPlugin,VRMUtils} from "@pixiv/three-vrm";
import {applyModelProfile,embeddedProfile} from "./model_profile.mjs";
export function modelLoader() {
  const loader = new GLTFLoader(); loader.register(parser => new VRMLoaderPlugin(parser)); return loader;
}
export function prepareModel(gltf) {
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error("模型未加载为人形角色.");
  VRMUtils.rotateVRM0(vrm); VRMUtils.combineSkeletons(vrm.scene);
  if (vrm.lookAt) vrm.lookAt.autoUpdate = false;
  vrm.scene.traverse(object => {if (object.isMesh) object.frustumCulled = false;});
  return applyModelProfile(vrm,embeddedProfile(gltf));
}
