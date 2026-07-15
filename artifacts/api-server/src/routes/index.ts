import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fxrateRouter from "./fxrate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fxrateRouter);

export default router;
