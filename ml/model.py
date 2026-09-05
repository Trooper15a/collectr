"""EfficientNet-B0 embedding model: image -> L2-normalised 512-d vector."""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision.models import EfficientNet_B0_Weights, efficientnet_b0

from config import EMBED_DIM

# ImageNet statistics; must match preprocessing in the browser (web/src/lib/scanner/preprocess.ts).
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]


class CardEmbedder(nn.Module):
    def __init__(self, embed_dim: int = EMBED_DIM, pretrained: bool = True):
        super().__init__()
        weights = EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
        backbone = efficientnet_b0(weights=weights)
        in_features = backbone.classifier[1].in_features  # 1280
        backbone.classifier = nn.Identity()
        self.backbone = backbone
        self.head = nn.Sequential(
            nn.Dropout(0.2),
            nn.Linear(in_features, embed_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        feats = self.backbone(x)
        emb = self.head(feats)
        return F.normalize(emb, dim=-1)


def load_checkpoint(path: str, device: torch.device | str = "cpu") -> CardEmbedder:
    ckpt = torch.load(path, map_location=device, weights_only=False)
    model = CardEmbedder(embed_dim=ckpt.get("embed_dim", EMBED_DIM), pretrained=False)
    model.load_state_dict(ckpt["model"])
    model.to(device).eval()
    return model
