import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("synapseDesktop", { platform: process.platform });
