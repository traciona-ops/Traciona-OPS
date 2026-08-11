"use server";

/** Barrel estável — UI continua importando daqui. */
export {
  createLead,
  createContact,
  attachLeadToPipeline,
  moveLead,
  updateLead,
  deleteLead,
  addNote,
  addTag,
  removeTag,
  addLeadToPipeline,
  attachDeal,
  moveAllLeads,
  transferLead,
} from "./lead-actions";

export {
  createStage,
  updateStage,
  deleteStage,
  reorderStages,
  createPipeline,
  updatePipeline,
  deletePipeline,
  updateStageSla,
  reorderStage,
} from "./pipeline-actions";

export {
  createMeeting,
  deleteMeeting,
  createTask,
  toggleTask,
  updateTask,
  deleteTask,
} from "./activity-actions";

export {
  listAutomations,
  createAutomation,
  toggleAutomation,
  deleteAutomation,
} from "./automation-actions";
