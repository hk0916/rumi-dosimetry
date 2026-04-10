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

      if (isNaN(devId) || devId <= 0) {
        socket.close(1008, "Invalid deviceId");
        return;
      }

      if (!wsClients.has(devId)) {
        wsClients.set(devId, new Set());
      }
      wsClients.get(devId)!.add(socket);

      app.log.info(`WS client connected for device ${devId}`);

      socket.on("close", () => {
        wsClients.get(devId)?.delete(socket);
        if (wsClients.get(devId)?.size === 0) {
          wsClients.delete(devId);
        }
        app.log.info(`WS client disconnected for device ${devId}`);
      });

      socket.on("error", (err: Error) => {
        app.log.error(`WS error for device ${devId}: ${err.message}`);
        wsClients.get(devId)?.delete(socket);
      });

      // Ping/Pong heartbeat (30초)
      const pingInterval = setInterval(() => {
        if (socket.readyState === 1) {
          socket.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);

      socket.on("close", () => clearInterval(pingInterval));
    }
  );
}
