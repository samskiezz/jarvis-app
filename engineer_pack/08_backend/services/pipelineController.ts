export type PipelineAction = 'toggle' | 'run' | 'pause' | 'stop' | 'rerun';
export async function applyPipelineAction(id: string, action: PipelineAction, payload: unknown) {
  // Validate permission, check system mode, update queue/workflow, audit action, emit event.
}
