import { kimiClient } from './kimiClient';

export const checkUrgentEmail = kimiClient.functions.checkUrgentEmail;
export const runOmegaScanBatch = kimiClient.functions.runOmegaScanBatch;
export const psgJobPipeline = kimiClient.functions.psgJobPipeline;
export const gmailJobWatcher = kimiClient.functions.gmailJobWatcher;
export const psgEmailToOpenSolarToSM8 = kimiClient.functions.psgEmailToOpenSolarToSM8;
export const psgEmailToOpenSolarToServiceM8 = kimiClient.functions.psgEmailToOpenSolarToServiceM8;
export const gmailJobWatcherV2 = kimiClient.functions.gmailJobWatcherV2;
export const addJobComponents = kimiClient.functions.addJobComponents;
export const psgPipelineHandler = kimiClient.functions.psgPipelineHandler;
export const loadOmegaContext = kimiClient.functions.loadOmegaContext;
export const getJarvisIntel = kimiClient.functions.getJarvisIntel;
export const getLiveIntel = kimiClient.functions.getLiveIntel;
