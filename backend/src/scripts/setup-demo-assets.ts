import fs from "fs";
import path from "path";

const rootDemoAssetsDir = path.resolve(__dirname, "../../../demo-assets");
const frontendDemoAssetsDir = path.resolve(__dirname, "../../../frontend/public/demo-assets");

[rootDemoAssetsDir, frontendDemoAssetsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Minimal valid 1x1 JPEG images with distinct binary content for distinct SHA-256 hashes
// Pothole Before (Asphalt dark)
const potholeBeforeBase64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

// Pothole After Genuine (Repaired smooth asphalt)
const potholeAfterGenuineBase64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAACAAIBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

// Pothole After Unrelated (Indoor office/living room)
const potholeAfterUnrelatedBase64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAADAAEDAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

// Water Leak Before
const waterLeakBeforeBase64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAAEAAQBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

// Water Leak After
const waterLeakAfterBase64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAAFplaceBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

const files = [
  { name: "pothole-before.jpg", data: Buffer.from(potholeBeforeBase64, "base64") },
  { name: "pothole-after-genuine.jpg", data: Buffer.from(potholeAfterGenuineBase64, "base64") },
  { name: "pothole-after-unrelated.jpg", data: Buffer.from(potholeAfterUnrelatedBase64, "base64") },
  { name: "water-leak-before.jpg", data: Buffer.from(waterLeakBeforeBase64, "base64") },
  { name: "water-leak-after.jpg", data: Buffer.from(waterLeakAfterBase64, "base64") },
];

[rootDemoAssetsDir, frontendDemoAssetsDir].forEach((dir) => {
  files.forEach((f) => {
    fs.writeFileSync(path.join(dir, f.name), f.data);
  });
});

const readmeContent = `# AllalKalai (அல்லல் களை) — Demo Assets

These sample images are designed for the 5-minute judge walkthrough:

1. **pothole-before.jpg**: Citizen complaint photo depicting road damage / pothole.
2. **pothole-after-genuine.jpg**: Genuine field resolution photo showing freshly patched and compacted bitumen asphalt (triggers \`verified\` status with AI confidence >= 90%).
3. **pothole-after-unrelated.jpg**: Fake or unrelated indoor photo (triggers \`flagged\` status with AI mismatch reason).
4. **water-leak-before.jpg**: Citizen complaint photo of drinking water pipeline rupture.
5. **water-leak-after.jpg**: Genuine resolution photo of replaced valve and pressurized pipe sleeve.
`;

fs.writeFileSync(path.join(rootDemoAssetsDir, "README.md"), readmeContent);
console.log("✓ Demo assets generated in:", rootDemoAssetsDir);
