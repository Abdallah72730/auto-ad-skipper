# Auto Ad Skipper

An open-source Firefox extension that automatically skips YouTube ads using a three-tier detection system with AI vision fallback.

## Features

- **Tier 1:** Fast DOM selectors (self-learning from localStorage)
- **Tier 2:** NeoVision – text and positional heuristics
- **Tier 3:** AI Vision – on-device YOLO model for visual detection
- **Human Click Simulation** – bypasses YouTube's `isTrusted` checks
- **Self-Updating** via GitHub Releases

## Installation

1. Download the latest `.xpi` from [Releases](https://github.com/Abdallah72730/auto-ad-skipper/releases).
2. Open Firefox → `about:addons` → Gear → "Install Add-on From File..."
3. Select the `.xpi` file.

## AI Model Setup

The AI tier requires an ONNX model.  
**Recommended:** Download `yolov8n.onnx` from [Ultralytics](https://github.com/ultralytics/assets/releases) and place it in `src/model/`.

*Note: The extension will still function without the model (Tiers 1 & 2).*

## Development

```bash
git clone https://github.com/Abdallah72730/auto-ad-skipper.git
cd auto-ad-skipper
# Add the ONNX model to src/model/
# Load temporarily in Firefox: about:debugging → This Firefox → Load Temporary Add-on → select manifest.json