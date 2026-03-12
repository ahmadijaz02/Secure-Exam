import argparse
import os
from ultralytics import YOLO


def main():
    parser = argparse.ArgumentParser(description="Export YOLO checkpoint to ONNX")
    parser.add_argument("--weights", default="best (3).pt", help="Path to YOLO .pt checkpoint")
    parser.add_argument("--imgsz", type=int, default=640, help="Export image size (square)")
    parser.add_argument("--opset", type=int, default=12, help="ONNX opset version")
    args = parser.parse_args()

    weights_path = os.path.abspath(args.weights)
    if not os.path.exists(weights_path):
        raise FileNotFoundError(f"Checkpoint not found: {weights_path}")

    model = YOLO(weights_path)
    out_path = model.export(format="onnx", imgsz=args.imgsz, dynamic=False, simplify=False, opset=args.opset)
    print(f"Export complete: {out_path}")


if __name__ == "__main__":
    main()
