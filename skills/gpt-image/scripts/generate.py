"""同步调用 sub2api Images API，输入输出路径相对于任务工作目录。"""
import argparse
import base64
import binascii
import json
import os
from pathlib import Path
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from xml.etree import ElementTree


def image_format(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp"
    if data.lstrip(b"\xef\xbb\xbf \t\r\n").startswith(b"<"):
        if ElementTree.fromstring(data).tag in ("svg", "{http://www.w3.org/2000/svg}svg"):
            return "svg"
    raise ValueError("无法识别图片内容")


def image_reference(source):
    if source.startswith(("https://", "http://", "data:image/")):
        return {"image_url": source}
    data = Path(source).read_bytes()
    fmt = image_format(data)
    mime = "svg+xml" if fmt == "svg" else fmt
    encoded = base64.b64encode(data).decode("ascii")
    return {"image_url": f"data:image/{mime};base64,{encoded}"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description="通过 sub2api 生成或编辑 GPT Image 图片",
                                     epilog="当前 Sunburst 路线原生 GIF 不支持。各参数实测见 references/sunburst-parameters.md。")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--model", default="gpt-image-2.6-sunburst")
    parser.add_argument("--image", action="append", default=[], help="参考图路径或 URL，可重复")
    parser.add_argument("--mask")
    parser.add_argument("--markup")
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--size")
    parser.add_argument("--quality")
    parser.add_argument("--complexity", choices=["low", "medium", "high"])
    parser.add_argument("--format", dest="output_format", choices=["png", "jpeg", "webp", "gif", "svg"])
    parser.add_argument("--background")
    parser.add_argument("--input-fidelity")
    parser.add_argument("--style")
    parser.add_argument("--moderation")
    parser.add_argument("--output-compression", type=int, choices=range(101), metavar="0..100")
    parser.add_argument("--frame-count", type=int)
    parser.add_argument("--frame-duration-ms", type=int)
    parser.add_argument("--n", type=int, default=1)
    args = parser.parse_args()
    if not args.prompt.strip() or not args.model.strip():
        parser.error("prompt 和 model 需要非空文本")
    if (args.mask or args.markup) and not args.image:
        parser.error("编辑蒙版或标注图需要 --image")
    if any(n is not None and n < 1 for n in (args.n, args.frame_count, args.frame_duration_ms)):
        parser.error("张数、帧数与帧时长需要为正整数")
    base = os.environ.get("SUB2API_BASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUB2API_API_KEY", "").strip()
    if not base or not key:
        parser.error("请为同一网关配置 SUB2API_BASE_URL 和 SUB2API_API_KEY")
    url = urllib.parse.urlsplit(base)
    local_http = url.scheme == "http" and url.hostname in {"localhost", "127.0.0.1", "::1"}
    if (url.scheme != "https" and not local_http) or not url.hostname or url.username or url.password or url.query or url.fragment:
        parser.error("网关地址需为 HTTPS 或本机 HTTP 根地址，可含 /v1")
    payload = {"model": args.model, "prompt": args.prompt, "response_format": "b64_json"}
    for name in ("size", "quality", "complexity", "output_format", "background", "style",
                 "output_compression", "input_fidelity", "moderation", "frame_count", "frame_duration_ms", "n"):
        value = getattr(args, name)
        if value is not None:
            payload[name] = value
    endpoint = "generations"
    if args.image:
        endpoint = "edits"
        payload["images"] = [image_reference(source) for source in args.image]
        for name in ("mask", "markup"):
            if getattr(args, name):
                payload[name] = image_reference(getattr(args, name))
    if not base.endswith("/v1"):
        base += "/v1"
    args.out_dir.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(f"{base}/images/{endpoint}", json.dumps(payload).encode(),
                                     headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=900) as response:
            result = json.load(response)
    except urllib.error.HTTPError as err:
        raise ValueError(f"网关返回 HTTP {err.code}，请求 ID {err.headers.get('x-request-id', '未知')}") from None
    items = result.get("data") if isinstance(result, dict) else None
    if not isinstance(items, list) or not items:
        raise ValueError("网关未返回图片 data")
    run_dir = Path(tempfile.mkdtemp(prefix="gpt-image-", dir=args.out_dir))
    for i, item in enumerate(items, start=1):
        encoded = item.get("b64_json") if isinstance(item, dict) else None
        if not isinstance(encoded, str) or not encoded:
            raise ValueError(f"第 {i} 张缺少 b64_json")
        data = base64.b64decode(encoded, validate=True)
        fmt = image_format(data)
        dest = run_dir / f"image-{i}.{fmt}"
        dest.write_bytes(data)
        print(dest.resolve(), flush=True)
        if args.output_format and fmt != args.output_format:
            print(f"请求格式 {args.output_format}，实际收到 {fmt}", file=sys.stderr)
    if len(items) != args.n:
        print(f"请求 {args.n} 张，收到 {len(items)} 张", file=sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, binascii.Error, ElementTree.ParseError) as error:
        sys.exit(str(error))
