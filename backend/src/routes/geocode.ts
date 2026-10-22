import { Router, Request, Response, NextFunction } from "express";

export const geocodeRouter = Router();

geocodeRouter.post("/api/reverse-geocode", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lat, lon } = req.body;

    if (typeof lat !== "number" || typeof lon !== "number") {
      return res.status(400).json({ error: "lat and lon must be numbers" });
    }

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      {
        headers: {
          "User-Agent": "AllalKalai-GrievancePlatform/1.0",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.statusText}`);
    }

    const data = (await response.json()) as { display_name?: string };
    const address = data.display_name || "Unable to determine address";

    res.json({ address });
  } catch (err) {
    next(err);
  }
});
