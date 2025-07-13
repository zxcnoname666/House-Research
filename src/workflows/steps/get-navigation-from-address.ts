import { z } from "zod";
import {Step} from "workflow-core";
import {encode as qs} from 'node:querystring';
import {getCoordsByParsedAddress, parseAddress} from "./methods/coords.ts";
import {safeFreeAi} from "./methods/ai.ts";
import parseBusStops from "#ai-agents/prompts/parse-bus-stops.ts";
import parseMapRoutes from "#ai-agents/prompts/parse-map-routes.ts";
import {RAPID_API_KEY} from "#env";
import {Config} from "#config";
import {log} from "#logger";

export default new Step<
    { address: string },
    { stops: string, routes: string[] }
>({
    id: "getNavigationFromAddress",
    inputSchema: z.object({ address: z.string() }),
    outputSchema: z.object({ stops: z.string(), routes: z.array(z.string()) }),
    async execute({ address }) {
        log.debug("run step");
        try {
            return await runStep(address);
        } catch {
            return { stops: "", routes: [] };
        }
    },
});

async function runStep(address: string): Promise<{stops: string, routes: string[]}> {
    const toRoutes = (await Config.get()).importantLocations;
    const parsedAddress = await parseAddress(address);
    log.debug("parsedAddress:", parsedAddress);
    const coords = await getCoordsByParsedAddress(parsedAddress);
    log.debug("coords:", coords);
    const jsonStops = await getStopsInRadius(coords[0].lat, coords[0].lon);
    log.debug("jsonStops...");
    const stops = await safeFreeAi(parseBusStops, `${jsonStops}`);
    log.debug("stops...");

    const promises: Promise<string>[] = [];
    for (const toRoute of toRoutes) {
        promises.push((async () => {
            const jsonRoutes = await getRouteToLocation(coords[0], toRoute);
            log.debug("jsonRoutes...");
            const route = await safeFreeAi(parseMapRoutes, `[TONAME]${toRoute.name}[/TONAME]\n[JSON]${jsonRoutes}[/JSON]`);
            log.debug("route...");
            return route;
        })());
    }

    const routes = await Promise.all(promises);

    return { stops, routes };
}

async function getStopsInRadius(lat: string|number, lon: string|number): Promise<string> {
    const url = "https://wikiroutes-api.p.rapidapi.com/stopsInRadius?" + qs({
        lat: lat,
        lon: lon,
        radius: 500,
        limit: 300,
    });

    return await internalMakeRapidRequest(url);
}

async function getRouteToLocation(source: {lat: string|number, lon: string|number}, dest: {lat: string|number, lon: string|number}): Promise<string> {
    const url = "https://wikiroutes-api.p.rapidapi.com/routes?" + qs({
        origin: `${source.lat},${source.lon}`,
        destination: `${dest.lat},${dest.lon}`,
    });

    return await internalMakeRapidRequest(url);
}

async function internalMakeRapidRequest(url: string) {
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': 'unknown',
            'x-rapidapi-host': 'wikiroutes-api.p.rapidapi.com'
        }
    };

    for (const key of RAPID_API_KEY) {
        try {
            options.headers['x-rapidapi-key'] = key;
            const response = await fetch(url, options);
            const text = await response.text();

            if (text.includes("Upgrade your plan")) continue;
            return JSON.stringify(JSON.parse(text));
        } catch (e) {
            log.debug(e);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    throw new Error("no rapid api key");
}

if (import.meta.main) {
    const address = "Краснодарский край, Краснодар, Карасунский, мкр. Черемушки, Ставропольская ул., 113";
    console.info("address:", address);
    const parsedAddress = await parseAddress(address);
    console.info("parsedAddress:", parsedAddress);
    const coords = await getCoordsByParsedAddress(parsedAddress);
    console.info("coords:", coords);
    const jsonStops = await getStopsInRadius(coords[0].lat, coords[0].lon);
    console.info("jsonStops:", jsonStops);
    const stops = await safeFreeAi(parseBusStops, `${jsonStops}`)

    const routes: string[] = [];
    const toRoutes = (await Config.get()).importantLocations;
    for (const toRoute of toRoutes) {
        const jsonRoutes = await getRouteToLocation(coords[0], toRoute);
        console.info("jsonRoutes:", jsonRoutes);
        const route = await safeFreeAi(parseMapRoutes, `[TONAME]${toRoute.name}[/TONAME]\n[JSON]${jsonRoutes}[/JSON]`);
        console.info("route:", route);
        routes.push(route);
    }

    console.info("stops:", stops);
    console.info("routes:", routes);
}