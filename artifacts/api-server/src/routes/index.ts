import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import vesselsRouter from "./vessels";
import monthlyRhRouter from "./monthly_rh";
import componentsRouter from "./components";
import cylindersRouter from "./cylinders";
import movementsRouter from "./movements";
import dashboardRouter from "./dashboard";
import valvesRouter from "./valves";
import valveMovementsRouter from "./valve_movements";
import valveDashboardRouter from "./valve_dashboard";
import importVesselRouter from "./import_vessel";
import componentTypeThresholdsRouter from "./component_type_thresholds";
import { authenticate } from "../middlewares/authenticate";
import { authorizeVesselAccess } from "../middlewares/authorizeVesselAccess";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

// Everything below requires an authenticated session.
router.use(authenticate);

router.use(usersRouter);
router.use(vesselsRouter);

// Vessel-scoped routers: enforce access to :vesselId before reaching handlers.
router.use("/vessels/:vesselId", authorizeVesselAccess);
router.use(monthlyRhRouter);
router.use(componentsRouter);
router.use(cylindersRouter);
router.use(movementsRouter);
router.use(dashboardRouter);
router.use(valvesRouter);
router.use(valveMovementsRouter);
router.use(valveDashboardRouter);
router.use(importVesselRouter);
router.use(componentTypeThresholdsRouter);

export default router;
