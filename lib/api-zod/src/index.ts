export * from "./generated/api";

import {
  healthCheckResponse,
  createVesselBody,
  getVesselParams,
  updateVesselParams,
  updateVesselBody,
  deleteVesselParams,
  resetVesselDataParams,
  listMonthlyRhParams,
  addMonthlyRhParams,
  addMonthlyRhBody,
  deleteMonthlyRhEntryParams,
  listComponentsParams,
  createComponentParams,
  createComponentBody,
  getComponentParams,
  updateComponentParams,
  updateComponentBody,
  deleteComponentParams,
  listCylindersParams,
  updateCylinderParams,
  updateCylinderBody,
  listMovementsParams,
  recordMovementParams,
  recordMovementBody,
  deleteMovementParams,
  getDashboardParams,
  recalculateComponentRhParams,
  loginBody,
  createUserBody,
  updateUserParams,
  updateUserBody,
  deleteUserParams,
  listUserVesselAccessParams,
  grantVesselAccessParams,
  grantVesselAccessBody,
  revokeVesselAccessParams,
} from "./generated/api";

// The hand-written route handlers were authored against PascalCase schema
// names. Orval's zod client only emits camelCase per-operation schema names,
// so these are plain aliases to avoid touching route-handler source.
export const HealthCheckResponse = healthCheckResponse;
export const CreateVesselBody = createVesselBody;
export const GetVesselParams = getVesselParams;
export const UpdateVesselParams = updateVesselParams;
export const UpdateVesselBody = updateVesselBody;
export const DeleteVesselParams = deleteVesselParams;
export const ResetVesselDataParams = resetVesselDataParams;
export const ListMonthlyRhParams = listMonthlyRhParams;
export const AddMonthlyRhParams = addMonthlyRhParams;
export const AddMonthlyRhBody = addMonthlyRhBody;
export const DeleteMonthlyRhEntryParams = deleteMonthlyRhEntryParams;
export const ListComponentsParams = listComponentsParams;
export const CreateComponentParams = createComponentParams;
export const CreateComponentBody = createComponentBody;
export const GetComponentParams = getComponentParams;
export const UpdateComponentParams = updateComponentParams;
export const UpdateComponentBody = updateComponentBody;
export const DeleteComponentParams = deleteComponentParams;
export const ListCylindersParams = listCylindersParams;
export const UpdateCylinderParams = updateCylinderParams;
export const UpdateCylinderBody = updateCylinderBody;
export const ListMovementsParams = listMovementsParams;
export const RecordMovementParams = recordMovementParams;
export const RecordMovementBody = recordMovementBody;
export const DeleteMovementParams = deleteMovementParams;
export const GetDashboardParams = getDashboardParams;
export const RecalculateComponentRhParams = recalculateComponentRhParams;
export const LoginBody = loginBody;
export const CreateUserBody = createUserBody;
export const UpdateUserParams = updateUserParams;
export const UpdateUserBody = updateUserBody;
export const DeleteUserParams = deleteUserParams;
export const ListUserVesselAccessParams = listUserVesselAccessParams;
export const GrantVesselAccessParams = grantVesselAccessParams;
export const GrantVesselAccessBody = grantVesselAccessBody;
export const RevokeVesselAccessParams = revokeVesselAccessParams;
