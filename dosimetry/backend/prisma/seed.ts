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

  console.log("Seed completed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
