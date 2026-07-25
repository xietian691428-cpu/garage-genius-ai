import { NextRequest } from "next/server";
import {
  getVcdbStatus,
  listMakes,
  listModels,
  listOptions,
  listSubmodels,
  listYears,
  resolveConfig,
} from "@/lib/vcdb/query";

export const runtime = "nodejs";

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action") || "status";

  try {
    if (action === "status") {
      return Response.json(getVcdbStatus());
    }

    const status = getVcdbStatus();
    if (!status.available) {
      return Response.json(status, { status: 503 });
    }

    if (action === "years") {
      return Response.json({ years: listYears() });
    }

    const year = Number(searchParams.get("year"));
    if (action === "makes") {
      if (!Number.isFinite(year)) return badRequest("year is required");
      return Response.json({ makes: listMakes(year) });
    }

    const make = (searchParams.get("make") || "").trim();
    if (action === "models") {
      if (!Number.isFinite(year) || !make) {
        return badRequest("year and make are required");
      }
      return Response.json({ models: listModels(year, make) });
    }

    const model = (searchParams.get("model") || "").trim();
    if (action === "submodels") {
      if (!Number.isFinite(year) || !make || !model) {
        return badRequest("year, make, and model are required");
      }
      return Response.json({ submodels: listSubmodels(year, make, model) });
    }

    const submodel = (searchParams.get("submodel") || "").trim() || null;
    if (action === "options") {
      if (!Number.isFinite(year) || !make || !model) {
        return badRequest("year, make, and model are required");
      }
      return Response.json(listOptions(year, make, model, submodel));
    }

    if (action === "resolve") {
      if (!Number.isFinite(year) || !make || !model) {
        return badRequest("year, make, and model are required");
      }
      const resolved = resolveConfig({
        year,
        make,
        model,
        submodel,
        engine: searchParams.get("engine"),
        transmission: searchParams.get("transmission"),
        driveType: searchParams.get("driveType"),
        brakes: searchParams.get("brakes"),
      });
      return Response.json({ config: resolved });
    }

    return badRequest(
      "Unknown action. Use status|years|makes|models|submodels|options|resolve",
    );
  } catch (error: unknown) {
    console.error("[/api/vcdb]", error);
    const message =
      error instanceof Error ? error.message : "VCdb query failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
