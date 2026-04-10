import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Workspace
  const workspace = await prisma.workspace.upsert({
    where: { id: 1 },
    update: {},
    create: { name: "Default Workspace" },
  });

  // Admin user (password: admin1234)
  const hash = await bcrypt.hash("admin1234", 10);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash: hash,
      name: "관리자",
      role: "admin",
      accountType: "Local Account",
      workspaceId: workspace.id,
    },
  });

  // Super admin
  await prisma.user.upsert({
    where: { username: "superadmin" },
    update: {},
    create: {
      username: "superadmin",
      passwordHash: hash,
      name: "최고관리자",
      role: "super_admin",
      accountType: "Local Account",
      workspaceId: workspace.id,
    },
  });

  // Radiation weighting factors (ICRP 103)
  const radiationFactors = [
    { radiationSource: "photon", weightingFactor: 1 },
    { radiationSource: "electron_muon", weightingFactor: 1 },
    { radiationSource: "proton", weightingFactor: 2 },
    { radiationSource: "neutron", weightingFactor: 20 },
    { radiationSource: "alpha_heavy_ion", weightingFactor: 20 },
  ];

  for (const rf of radiationFactors) {
    await prisma.radiationWeightingFactor.upsert({
      where: { id: radiationFactors.indexOf(rf) + 1 },
      update: {},
      create: rf,
    });
  }

  // Tissue weighting factors (ICRP 103)
  const tissueFactors = [
    { organName: "breast", weightingFactor: 0.12 },
    { organName: "colon", weightingFactor: 0.12 },
    { organName: "stomach", weightingFactor: 0.12 },
    { organName: "lung", weightingFactor: 0.12 },
    { organName: "gonads", weightingFactor: 0.08 },
    { organName: "bladder", weightingFactor: 0.04 },
    { organName: "liver", weightingFactor: 0.04 },
    { organName: "esophagus", weightingFactor: 0.04 },
    { organName: "thyroid", weightingFactor: 0.04 },
    { organName: "bone_surface", weightingFactor: 0.01 },
    { organName: "brain", weightingFactor: 0.01 },
    { organName: "salivary_glands", weightingFactor: 0.01 },
    { organName: "skin", weightingFactor: 0.01 },
    { organName: "residual_tissues", weightingFactor: 0.12 },
  ];

  for (const tf of tissueFactors) {
    await prisma.tissueWeightingFactor.upsert({
      where: { id: tissueFactors.indexOf(tf) + 1 },
      update: {},
      create: tf,
    });
  }

  // ============ 더미 Gateway 데이터 ============
  const gateways = [
    {
      deviceName: "Gateway-01",
      deviceType: "Twin Tracker BLE",
      macAddress: "D1:FA:88:37:A0:86",
      status: "online" as const,
      serverIp: "49.50.139.85",
      serverUrl: "ws://49.50.139.85:5102/ws/gateway",
      ipAddress: "192.168.0.101",
      subnetMask: "255.255.255.0",
      gatewayIp: "192.168.0.1",
      dnsMain: "8.8.8.8",
      bleRssiThreshold: -90,
      deviceFwVersion: "0.0.1.2",
      bleFwVersion: "0.0.0.5",
      otaServerUrl: "http://49.50.139.85:5102/ota",
      wsServerUrl: "ws://49.50.139.85:5102/ws/gateway",
      reportInterval: 10,
      workspaceId: workspace.id,
      uptime: new Date(),
    },
    {
      deviceName: "Gateway-02",
      deviceType: "Twin Tracker BLE",
      macAddress: "A2:BC:DE:11:22:33",
      status: "online" as const,
      serverIp: "49.50.139.85",
      serverUrl: "ws://49.50.139.85:5102/ws/gateway",
      ipAddress: "192.168.0.102",
      subnetMask: "255.255.255.0",
      gatewayIp: "192.168.0.1",
      dnsMain: "8.8.8.8",
      bleRssiThreshold: -85,
      deviceFwVersion: "0.0.1.2",
      bleFwVersion: "0.0.0.5",
      reportInterval: 10,
      workspaceId: workspace.id,
      uptime: new Date(),
    },
    {
      deviceName: "Gateway-03",
      deviceType: "Twin Tracker BLE",
      macAddress: "B3:CD:EF:44:55:66",
      status: "offline" as const,
      serverIp: "49.50.139.85",
      ipAddress: "192.168.0.103",
      subnetMask: "255.255.255.0",
      gatewayIp: "192.168.0.1",
      bleRssiThreshold: -80,
      deviceFwVersion: "0.0.1.0",
      bleFwVersion: "0.0.0.4",
      reportInterval: 30,
      workspaceId: workspace.id,
    },
  ];

  for (const gw of gateways) {
    await prisma.gateway.upsert({
      where: { macAddress: gw.macAddress },
      update: {},
      create: gw,
    });
  }

  // ============ 더미 Device (태그) 데이터 ============
  const devices = [
    {
      deviceName: "Dosimeter-01",
      deviceType: "Skin Dosimeter",
      macAddress: "06:06:04:04:03:03",
      status: "online" as const,
      battery: 95,
      rssi: -52,
      voltage: 210.5,
      temperature: 2350,    // 23.50°C
      txPower: -4,
      advertisingCount: 152340,
      localName: "P_LAB",
      workspaceId: workspace.id,
      uptime: new Date(),
    },
    {
      deviceName: "Dosimeter-02",
      deviceType: "Skin Dosimeter",
      macAddress: "07:07:05:05:04:04",
      status: "online" as const,
      battery: 82,
      rssi: -61,
      voltage: 195.3,
      temperature: 2410,
      txPower: -4,
      advertisingCount: 98210,
      localName: "P_LAB",
      workspaceId: workspace.id,
      uptime: new Date(),
    },
    {
      deviceName: "Dosimeter-03",
      deviceType: "Skin Dosimeter",
      macAddress: "08:08:06:06:05:05",
      status: "online" as const,
      battery: 67,
      rssi: -45,
      voltage: 188.7,
      temperature: 2280,
      txPower: -4,
      advertisingCount: 234560,
      localName: "P_LAB",
      workspaceId: workspace.id,
      uptime: new Date(),
    },
    {
      deviceName: "Dosimeter-04",
      deviceType: "Skin Dosimeter",
      macAddress: "09:09:07:07:06:06",
      status: "offline" as const,
      battery: 12,
      rssi: -78,
      voltage: 105.2,
      temperature: 2190,
      txPower: -4,
      advertisingCount: 450120,
      localName: "P_LAB",
      workspaceId: workspace.id,
    },
    {
      deviceName: "Dosimeter-05",
      deviceType: "Skin Dosimeter",
      macAddress: "0A:0A:08:08:07:07",
      status: "online" as const,
      battery: 100,
      rssi: -38,
      voltage: 220.1,
      temperature: 2300,
      txPower: -4,
      advertisingCount: 5120,
      localName: "P_LAB",
      workspaceId: workspace.id,
      uptime: new Date(),
    },
  ];

  const createdDevices: { id: number; macAddress: string }[] = [];
  for (const dev of devices) {
    const d = await prisma.device.upsert({
      where: { macAddress: dev.macAddress },
      update: {},
      create: dev,
    });
    createdDevices.push({ id: d.id, macAddress: d.macAddress });
  }

  // ============ 더미 SensorData (최근 2시간, 5초 간격) ============
  const now = new Date();
  const sensorRecords: any[] = [];
  const HOURS = 2;
  const INTERVAL_SEC = 5;
  const totalPoints = (HOURS * 3600) / INTERVAL_SEC; // 1440 points per device

  for (const dev of createdDevices) {
    const baseVoltage = 180 + Math.random() * 40;
    for (let i = 0; i < totalPoints; i++) {
      const timestamp = new Date(now.getTime() - (totalPoints - i) * INTERVAL_SEC * 1000);
      const sineComponent = 30 * Math.sin((i / 100) * Math.PI * 2);
      const noise = (Math.random() - 0.5) * 8;
      const voltage = baseVoltage + sineComponent + noise;
      const rssi = -40 - Math.floor(Math.random() * 30);
      const battery = Math.max(10, 100 - Math.floor(i / 50));
      const temperature = 2200 + Math.floor(Math.random() * 300);

      sensorRecords.push({
        deviceId: dev.id,
        timestamp,
        voltage,
        rssi,
        battery,
        temperature,
        advertisingCount: i * 3,
        scanTick: i % 1000,
        gatewayMac: gateways[Math.floor(Math.random() * 2)].macAddress,
      });
    }
  }

  // 배치 insert (500개씩)
  const BATCH_SIZE = 500;
  for (let i = 0; i < sensorRecords.length; i += BATCH_SIZE) {
    const batch = sensorRecords.slice(i, i + BATCH_SIZE);
    await prisma.sensorData.createMany({ data: batch });
  }
  console.log(`SensorData: ${sensorRecords.length} records created (${createdDevices.length} devices × ${totalPoints} points)`);

  console.log("Seed completed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
