import { FastifyInstance } from "fastify";
import { wsClients } from "./data.js";

export async function monitoringRoutes(app: FastifyInstance) {
  // WebSocket /ws/monitoring/:deviceId
  app.get(
    "/monitoring/:deviceId",
    { websocket: true },
    (socket, request) => {
      const { deviceId } = request.params as { deviceId: string };
      const devId = Number(deviceId);

      if (!wsClients.has(devId)) {
        wsClients.set(devId, new Set());
      }
      wsClients.get(devId)!.add(socket);

      app.log.info(`WS client connected for device ${devId}`);

      socket.on("close", () => {
        wsClients.get(devId)?.delete(socket);
        app.log.info(`WS client disconnected for device ${devId}`);
      });
    }
  );
}
