"""Build the reproducible "安心问候" MVP showcase video.

The script intentionally uses the checked-in MVP screenshots and a local
deterministic scene card for branches that are not represented by a live
notification service. Windows SAPI supplies a local Chinese voice; FFmpeg
does the final MP4 encoding. No network API or user data is used.
"""

from __future__ import annotations

import argparse
import math
import os
import shutil
import subprocess
import tempfile
import wave
from array import array
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


WIDTH = 1920
HEIGHT = 1080
FPS = 30
SAMPLE_RATE = 22050
TOTAL_SECONDS = 200

BG = "#F4F7F5"
INK = "#17342C"
MUTED = "#5F746C"
GREEN = "#16764F"
GREEN_DARK = "#0C4B35"
GREEN_PALE = "#E6F2EC"
AMBER = "#B47712"
AMBER_PALE = "#FFF1D5"
RED = "#B6473E"
RED_PALE = "#FBE7E4"
BLUE = "#2E657C"
BLUE_PALE = "#E6F0F4"
WHITE = "#FFFFFF"
LINE = "#D7E1DC"


@dataclass(frozen=True)
class Scene:
    start: int
    duration: int
    label: str
    speech: str


SCENES = (
    Scene(0, 10, "01 真实问题", "异地照护最常见的问题，不是看一张健康大盘，而是确认：今天怎么样，需不需要我打电话。"),
    Scene(10, 12, "02 一个最短闭环", "安心问候只做一件事：老人说一句或点一下，家属收到一张带原话证据的安心回执。"),
    Scene(22, 10, "03 当前边界", "当前是前端演示 MVP。同一浏览器切换两种角色，使用本地状态和确定性规则验证核心闭环。"),
    Scene(32, 20, "04 场景一：报平安", "第一种情况，老人一句话报平安。系统只记录他说过的事实，不把一次回应扩写成身体健康。"),
    Scene(52, 16, "05 家属收到回执", "家属看到的不是一个不透明分数，而是状态、原话、判断依据和下一步。这里无需立即操作。"),
    Scene(68, 26, "06 场景二：需要关注", "第二种情况，同时提到头晕和漏服。回执进入今天需关注，只追问当前是否坐稳、是否需要家属来电，不诊断，也不决定该不该补服。"),
    Scene(94, 21, "07 场景三：立即联系", "第三种情况，原话命中跌倒和无法起身规则。页面要求家属立即人工确认；它不会假装已经发出通知，也不会自动呼叫急救。"),
    Scene(115, 20, "08 场景四：尚未确认", "没有回应不等于遇险。当前演示由按钮复现两次未回应，只生成尚未确认，建议家属先电话联系，再按家庭预案处理。"),
    Scene(135, 20, "09 场景五：用药边界", "面对调药问题，系统固定拒绝给出剂量建议，只提示不要自行加减、停换药，并联系医生或药师。"),
    Scene(155, 17, "10 原话就是证据", "每张回执都能回到原话。规则说清楚命中了什么，建议与事实分开展示，家属可以复核，而不是盲信机器。"),
    Scene(172, 15, "11 技术与下一步", "这版 MVP 聚焦适老操作、可解释规则和安全兜底。真实语音、大模型、消息通知与跨设备服务尚未接入，将在受控测试后逐步补齐。"),
    Scene(187, 13, "12 安心问候", "安心问候，不监控、不诊断。每天一句话，让远方家人知道，今天是否需要打电话。"),
)


def ps_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def find_tool(name: str) -> str:
    candidates = []
    on_path = shutil.which(name)
    if on_path:
        candidates.append(Path(on_path))
    home = Path.home()
    candidates.extend(
        [
            home / "AppData/Roaming/TRAE SOLO CN/ModularData/ai-agent/vm/tools/app/ffmpeg" / f"{name}.exe",
            home / "AppData/Roaming/bilibili/ffmpeg" / f"{name}.exe",
            home / "AppData/Local/Programs/Trae CN/resources/app/bin" / f"{name}.exe",
            home / "AppData/Local/Programs/TRAE SOLO CN/resources/app/bin" / f"{name}.exe",
        ]
    )
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    raise FileNotFoundError(f"Cannot locate {name}. Install FFmpeg or update the candidate paths.")


def find_font(bold: bool = False) -> Path:
    candidates = (
        [
            Path(r"C:\Windows\Fonts\msyhbd.ttc"),
            Path(r"C:\Windows\Fonts\msyhbd.ttf"),
            Path(r"C:\Windows\Fonts\simhei.ttf"),
        ]
        if bold
        else [
            Path(r"C:\Windows\Fonts\msyh.ttc"),
            Path(r"C:\Windows\Fonts\msyh.ttf"),
            Path(r"C:\Windows\Fonts\simsun.ttc"),
        ]
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("A Chinese Windows font (Microsoft YaHei or SimSun) is required.")


FONT_REGULAR = find_font(False)
FONT_BOLD = find_font(True)


def f(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REGULAR), size)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font_obj: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        line = ""
        for char in paragraph:
            candidate = line + char
            if line and draw.textbbox((0, 0), candidate, font=font_obj)[2] > width:
                lines.append(line)
                line = char
            else:
                line = candidate
        if line:
            lines.append(line)
    return lines or [""]


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    font_obj: ImageFont.FreeTypeFont,
    fill: str,
    width: int,
    spacing: int = 10,
) -> int:
    lines = wrap_text(draw, text, font_obj, width)
    draw.multiline_text(xy, "\n".join(lines), font=font_obj, fill=fill, spacing=spacing)
    bbox = draw.multiline_textbbox(xy, "\n".join(lines), font=font_obj, spacing=spacing)
    return bbox[3] - xy[1]


def rounded_card(
    canvas: Image.Image,
    box: tuple[int, int, int, int],
    fill: str = WHITE,
    outline: str | None = LINE,
    radius: int = 24,
) -> ImageDraw.ImageDraw:
    x, y, w, h = box
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((x + 4, y + 8, x + w + 4, y + h + 8), radius=radius, fill=(15, 45, 35, 28))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    canvas.paste(shadow, (0, 0), shadow)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((x, y, x + w, y + h), radius=radius, fill=fill, outline=outline, width=2 if outline else 1)
    return draw


def fit_image(image: Image.Image, size: tuple[int, int], crop: bool = False) -> Image.Image:
    target_w, target_h = size
    if crop:
        return ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    return ImageOps.contain(image, size, method=Image.Resampling.LANCZOS)


def paste_screen(canvas: Image.Image, image: Image.Image, box: tuple[int, int, int, int], label: str = "真实 MVP 页面") -> None:
    x, y, w, h = box
    rounded_card(canvas, box, fill=WHITE, outline="#C9D8D1", radius=22)
    inner = fit_image(image, (w - 24, h - 24))
    ox = x + (w - inner.width) // 2
    oy = y + (h - inner.height) // 2
    mask = Image.new("L", inner.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, inner.width, inner.height), radius=16, fill=255)
    canvas.paste(inner, (ox, oy), mask)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((x + 20, y + 18, x + 20 + 190, y + 52), radius=17, fill=GREEN_DARK)
    draw.text((x + 34, y + 22), label, font=f(17, True), fill=WHITE)


def top_header(canvas: Image.Image, section: str) -> None:
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, WIDTH, 102), fill=WHITE)
    draw.line((0, 101, WIDTH, 101), fill=LINE, width=2)
    draw.rounded_rectangle((72, 26, 126, 80), radius=14, fill=GREEN)
    draw.text((90, 35), "安", font=f(28, True), fill=WHITE)
    draw.text((148, 28), "安心问候", font=f(30, True), fill=INK)
    draw.text((148, 66), "60 秒安心回执 · 前端 MVP 演示", font=f(17), fill=MUTED)
    draw.text((1538, 41), "不监控  ·  不诊断  ·  只同步必要信息", font=f(18), fill=MUTED)
    draw.text((72, 139), section, font=f(23, True), fill=GREEN)


def subtitle_bar(canvas: Image.Image, text: str) -> None:
    draw = ImageDraw.Draw(canvas, "RGBA")
    x, y, w, h = 72, 914, 1776, 122
    draw.rounded_rectangle((x, y, x + w, y + h), radius=22, fill=(10, 31, 25, 235))
    draw.rectangle((x, y, x + 10, y + h), fill=GREEN)
    draw_wrapped(draw, (x + 36, y + 22), text, f(29, False), WHITE, w - 72, spacing=7)


def quote_card(canvas: Image.Image, box: tuple[int, int, int, int], title: str, quote: str, body: str, accent: str = GREEN) -> None:
    x, y, w, h = box
    draw = rounded_card(canvas, box, fill=WHITE, outline=LINE, radius=24)
    draw.rectangle((x, y, x + 10, y + h), fill=accent)
    draw.text((x + 34, y + 28), title, font=f(23, True), fill=accent)
    draw_wrapped(draw, (x + 34, y + 86), f'“{quote}”', f(31, True), INK, w - 68, spacing=8)
    draw_wrapped(draw, (x + 34, y + 198), body, f(21), MUTED, w - 68, spacing=8)


def info_row(draw: ImageDraw.ImageDraw, x: int, y: int, label: str, value: str, accent: str = GREEN) -> None:
    draw.ellipse((x, y + 5, x + 18, y + 23), fill=accent)
    draw.text((x + 32, y), label, font=f(20, True), fill=INK)
    draw.text((x + 32, y + 32), value, font=f(18), fill=MUTED)


def render_scene(
    scene: Scene,
    senior: Image.Image,
    family: Image.Image,
    urgent: Image.Image | None = None,
    no_response: Image.Image | None = None,
    medication: Image.Image | None = None,
) -> Image.Image:
    canvas = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(canvas)
    if scene.label.startswith("12"):
        canvas = Image.new("RGB", (WIDTH, HEIGHT), GREEN_DARK)
        draw = ImageDraw.Draw(canvas)
        draw.rounded_rectangle((82, 90, 143, 151), radius=16, fill=GREEN)
        draw.text((102, 101), "安", font=f(32, True), fill=WHITE)
        draw.text((82, 230), "安心问候", font=f(82, True), fill=WHITE)
        draw.text((86, 350), "60 秒安心回执", font=f(42, True), fill="#BFE4D0")
        draw_wrapped(draw, (86, 470), "每天一句话，让远方家人知道今天是否需要打电话", f(36), WHITE, 1080, spacing=12)
        draw.text((86, 640), "不监控  ·  不诊断  ·  只同步必要信息", font=f(25), fill="#D0E9DC")
        draw.text((86, 905), "前端演示 MVP  |  本地共享状态  |  确定性规则引擎", font=f(21), fill="#BFE4D0")
        subtitle_bar(canvas, scene.speech)
        return canvas

    top_header(canvas, scene.label)

    if scene.label.startswith("01"):
        rounded_card(canvas, (72, 205, 610, 600), fill=GREEN_DARK, outline=None, radius=28)
        draw.text((116, 252), "照护信息常卡在两端", font=f(35, True), fill=WHITE)
        draw_wrapped(draw, (116, 336), "普通聊天：有回应，但没有可执行结论。\n健康大盘：信息很多，却增加设备和隐私负担。\n未接电话：不能直接等同于遇险。", f(25), "#E5F3EB", 500, spacing=16)
        draw.text((116, 653), "我们把问题缩成一次 60 秒问候。", font=f(25, True), fill="#BFE4D0")
        paste_screen(canvas, senior, (740, 181, 1100, 710), "老人端真实页面")
    elif scene.label.startswith("02"):
        draw.text((72, 213), "一个回应，生成一张可行动回执", font=f(42, True), fill=INK)
        draw_wrapped(draw, (74, 285), "老人不用学习复杂功能，家属不用猜测机器结论。", f(25), MUTED, 820)
        steps = [
            ("1", "说一句 / 点一下", "输入最少必要信息", GREEN),
            ("2", "提取可观察事实", "确定性规则保留原话", BLUE),
            ("3", "生成安心回执", "状态 + 证据 + 动作", AMBER),
            ("4", "人工确认", "家属决定是否回拨", RED),
        ]
        x = 78
        for number, title, body, color in steps:
            rounded_card(canvas, (x, 430, 390, 218), fill=WHITE, outline=LINE, radius=22)
            draw.ellipse((x + 28, 458, x + 82, 512), fill=color)
            draw.text((x + 47, 465), number, font=f(26, True), fill=WHITE)
            draw.text((x + 105, 456), title, font=f(23, True), fill=INK)
            draw_wrapped(draw, (x + 30, 546), body, f(20), MUTED, 325)
            if x < 1200:
                draw.text((x + 398, 510), ">", font=f(32, True), fill="#9DB2A8")
            x += 440
        paste_screen(canvas, senior, (1330, 180, 500, 490), "真实首页")
    elif scene.label.startswith("03"):
        draw.text((72, 214), "当前能验证的范围", font=f(42, True), fill=INK)
        draw_wrapped(draw, (75, 288), "这是一条可复现的前端业务链路，不是生产照护服务。", f(25), MUTED, 760)
        boundaries = [
            ("当前可演示", "文字输入 / 三个大按钮\n结构化回执 / 原话证据\n同一浏览器角色切换", GREEN_PALE, GREEN),
            ("明确未接入", "云端大模型 / 真实语音\n消息通知 / 跨设备同步\n后台定时与送达状态", AMBER_PALE, AMBER),
            ("明确不做", "医疗诊断 / 调药建议\n自动 120 / 自动定位共享\n把未回应写成遇险", RED_PALE, RED),
        ]
        for i, (title, body, fill, accent) in enumerate(boundaries):
            x = 75 + i * 410
            rounded_card(canvas, (x, 430, 370, 250), fill=fill, outline=None, radius=22)
            draw.text((x + 28, 462), title, font=f(24, True), fill=accent)
            draw_wrapped(draw, (x + 28, 525), body, f(20), INK, 310, spacing=10)
        paste_screen(canvas, family, (1330, 190, 500, 500), "真实回执结构")
    elif scene.label.startswith("04"):
        quote_card(canvas, (72, 220, 670, 435), "老人端 · 场景输入", "挺好的，早上的药吃过了", "点击提交后，页面只确认一次回应；不把它扩写成身体健康。", GREEN)
        draw.text((72, 714), "事实提取", font=f(21, True), fill=GREEN)
        info_row(draw, 72, 758, "状态", "今日已回应", GREEN)
        info_row(draw, 370, 758, "证据", "挺好的 · 药吃过了", GREEN)
        paste_screen(canvas, senior, (820, 174, 1000, 690), "老人端真实页面")
    elif scene.label.startswith("05"):
        quote_card(canvas, (72, 220, 600, 420), "家属端 · 回执结构", "今日已回应", "原话、命中事实和建议动作集中在一张卡片里。这里无需立即操作。", GREEN)
        draw.text((72, 700), "家属一眼回答", font=f(22, True), fill=GREEN)
        draw_wrapped(draw, (72, 748), "发生了什么？  为什么这样判断？  我需要做什么？", f(25, True), INK, 610, spacing=10)
        paste_screen(canvas, family, (720, 174, 1100, 700), "家属端真实页面")
    elif scene.label.startswith("06"):
        quote_card(canvas, (72, 218, 650, 440), "示例输入 · 今天需关注", "有点头晕，药还没吃", "命中两条可观察事实：提到身体不适；表示用药尚未完成。只追问当前是否坐稳。", AMBER)
        draw.text((72, 707), "建议动作", font=f(21, True), fill=AMBER)
        draw_wrapped(draw, (72, 752), "家属尽快电话确认；以既有医嘱为准。", f(25, True), INK, 620)
        paste_screen(canvas, family, (790, 174, 1030, 700), "真实回执结构")
    elif scene.label.startswith("07"):
        quote_card(canvas, (72, 214, 670, 445), "规则分支演示 · 需要立即联系", "我摔了，起不来了", "高优规则只要求家属立即人工确认。演示页不声称已通知、不自动呼叫急救。", RED)
        draw.rounded_rectangle((72, 700, 665, 792), radius=18, fill=RED_PALE)
        draw.text((102, 721), "下一步：家属电话确认，再按当地流程求助", font=f(24, True), fill=RED)
        dark = (urgent or family).copy().convert("RGB")
        shade = Image.new("RGBA", dark.size, (90, 30, 25, 70))
        dark = Image.alpha_composite(dark.convert("RGBA"), shade).convert("RGB")
        paste_screen(canvas, dark, (790, 174, 1030, 700), "紧急分支真实页面")
    elif scene.label.startswith("08"):
        quote_card(canvas, (72, 214, 670, 445), "规则分支演示 · 今日尚未确认", "2 次问候均未收到回应", "无回应只记录事实，不推断老人遇险。第一步是家属电话联系。", BLUE)
        draw.rounded_rectangle((72, 700, 665, 792), radius=18, fill=BLUE_PALE)
        draw.text((102, 721), "演示控制触发；不代表真实后台定时任务", font=f(24, True), fill=BLUE)
        gray = ImageOps.grayscale((no_response or family)).convert("RGB")
        paste_screen(canvas, gray, (790, 174, 1030, 700), "未回应分支真实页面")
    elif scene.label.startswith("09"):
        quote_card(canvas, (72, 214, 670, 445), "安全边界演示 · 不调药", "能不能多吃一片？", "固定回应：不能帮您调整药量。联系家人、医生或药师核对，不生成剂量答案。", AMBER)
        draw.rounded_rectangle((72, 700, 665, 792), radius=18, fill=AMBER_PALE)
        draw.text((100, 719), "拒绝调药建议  >  转交可信任的人", font=f(24, True), fill=AMBER)
        paste_screen(canvas, medication or family, (790, 174, 1030, 700), "调药拒答真实页面")
    elif scene.label.startswith("10"):
        paste_screen(canvas, family, (72, 186, 980, 640), "真实页面 · 原话区域")
        rounded_card(canvas, (1070, 186, 775, 640), fill=WHITE, outline=LINE, radius=24)
        draw.text((1110, 226), "一条证据链", font=f(32, True), fill=GREEN)
        evidence = [
            ("原话", "我今天有点不舒服", GREEN),
            ("命中片段", "“不舒服”", BLUE),
            ("事实含义", "原话提到身体不适", AMBER),
            ("建议动作", "先人工确认", RED),
        ]
        y = 320
        for title, value, accent in evidence:
            draw.ellipse((1110, y + 5, 1132, y + 27), fill=accent)
            draw.text((1160, y), title, font=f(21, True), fill=INK)
            draw.text((1160, y + 39), value, font=f(20), fill=MUTED)
            y += 112
        draw.text((1110, 766), "结论必须能回到原话。", font=f(24, True), fill=GREEN)
    elif scene.label.startswith("11"):
        draw.text((72, 205), "规则兜底，AI 增强留在下一阶段", font=f(41, True), fill=INK)
        draw_wrapped(draw, (75, 276), "当前不调用云端模型；先把安全边界和可解释回执做成可复现基线。", f(24), MUTED, 1100)
        pipeline = [
            ("输入", "文字 / 三按钮", GREEN),
            ("规则", "紧急 · 不适 · 用药", BLUE),
            ("回执", "状态 · 原话 · 动作", AMBER),
            ("人工", "家属电话确认", RED),
        ]
        x = 84
        for i, (title, body, accent) in enumerate(pipeline):
            rounded_card(canvas, (x, 470, 365, 188), fill=WHITE, outline=LINE, radius=22)
            draw.text((x + 28, 503), title, font=f(24, True), fill=accent)
            draw_wrapped(draw, (x + 28, 566), body, f(21), INK, 300)
            if i < len(pipeline) - 1:
                draw.text((x + 376, 533), ">", font=f(32, True), fill="#98AAA2")
            x += 440
        paste_screen(canvas, senior, (1345, 190, 460, 490), "真实首页")
    else:
        paste_screen(canvas, senior, (72, 180, 840, 690), "老人端")
        paste_screen(canvas, family, (980, 180, 840, 690), "家属端")

    subtitle_bar(canvas, scene.speech)
    return canvas


def synthesize(text: str, output: Path, powershell: str) -> None:
    ps = f"""
$ErrorActionPreference = 'Stop'
$out = {ps_quote(str(output))}
$voice = New-Object -ComObject SAPI.SpVoice
$candidate = $voice.GetVoices() | Where-Object {{ $_.GetDescription() -match 'Huihui|Chinese|中文' }} | Select-Object -First 1
if ($candidate) {{ $voice.Voice = $candidate }}
$stream = New-Object -ComObject SAPI.SpFileStream
$stream.Format.Type = 22
$stream.Open($out, 3, $false)
$voice.AudioOutputStream = $stream
$voice.Rate = 2
$voice.Volume = 100
[void]$voice.Speak({ps_quote(text)})
$stream.Close()
"""
    result = subprocess.run(
        [powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0 or not output.exists() or output.stat().st_size < 1000:
        raise RuntimeError(f"SAPI synthesis failed: {result.stderr.strip()}")


def read_pcm(path: Path) -> tuple[wave._wave_params, bytes]:
    with wave.open(str(path), "rb") as handle:
        params = handle.getparams()
        if params.nchannels != 1 or params.sampwidth != 2 or params.framerate != SAMPLE_RATE:
            raise RuntimeError(f"Unexpected SAPI format: {params}")
        return params, handle.readframes(params.nframes)


def fade_pcm(raw: bytes, rate: int = SAMPLE_RATE) -> bytes:
    values = array("h")
    values.frombytes(raw)
    fade_frames = min(int(rate * 0.04), len(values) // 2)
    for index in range(fade_frames):
        values[index] = int(values[index] * index / max(1, fade_frames))
        tail = len(values) - fade_frames + index
        values[tail] = int(values[tail] * (fade_frames - index) / max(1, fade_frames))
    return values.tobytes()


def write_master_audio(scene_audio: Iterable[tuple[Scene, bytes]], output: Path) -> None:
    total_frames = TOTAL_SECONDS * SAMPLE_RATE
    mix = array("h", [0]) * total_frames
    for scene, raw in scene_audio:
        values = array("h")
        values.frombytes(fade_pcm(raw))
        start = int((scene.start + 0.45) * SAMPLE_RATE)
        end = start + len(values)
        scene_end = int((scene.start + scene.duration) * SAMPLE_RATE)
        if end > scene_end or end > total_frames:
            raise RuntimeError(f"Narration overruns scene {scene.label}: {len(values) / SAMPLE_RATE:.2f}s")
        for index, value in enumerate(values[: end - start]):
            # Keep a barely audible generated bed so silent visual transitions
            # do not sound like a stopped recording; it contains no third-party audio.
            absolute = start + index
            t = absolute / SAMPLE_RATE
            bed = int(120 * math.sin(2 * math.pi * 196 * t) + 60 * math.sin(2 * math.pi * 247 * t))
            mixed = mix[absolute] + value + bed
            mix[absolute] = max(-32768, min(32767, mixed))
    with wave.open(str(output), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(mix.tobytes())


def find_powershell() -> str:
    for name in ("powershell.exe", "powershell"):
        path = shutil.which(name)
        if path:
            return path
    raise FileNotFoundError("Windows PowerShell is required for local Chinese SAPI narration.")


def write_concat_list(frames: list[Path], output: Path) -> None:
    lines: list[str] = []
    for frame, scene in zip(frames, SCENES):
        # FFmpeg concat paths use single quotes; double any embedded quote.
        safe = str(frame).replace("'", "'\\''")
        lines.append(f"file '{safe}'")
        lines.append(f"duration {scene.duration}")
    # The concat demuxer needs the final file repeated to honor the last duration.
    safe_last = str(frames[-1]).replace("'", "'\\''")
    lines.append(f"file '{safe_last}'")
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build(output: Path) -> None:
    repo = Path(__file__).resolve().parents[1]
    screenshots = repo / "docs" / "screenshots"
    senior = Image.open(screenshots / "senior-dashboard.png").convert("RGB")
    family = Image.open(screenshots / "family-dashboard.png").convert("RGB")
    urgent = Image.open(screenshots / "urgent-receipt.png").convert("RGB") if (screenshots / "urgent-receipt.png").exists() else None
    no_response = Image.open(screenshots / "no-response-receipt.png").convert("RGB") if (screenshots / "no-response-receipt.png").exists() else None
    medication = Image.open(screenshots / "medication-refusal.png").convert("RGB") if (screenshots / "medication-refusal.png").exists() else None
    ffmpeg = find_tool("ffmpeg")
    powershell = find_powershell()
    output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="anxin-showcase-") as temp_name:
        temp = Path(temp_name)
        frames: list[Path] = []
        scene_audio: list[tuple[Scene, bytes]] = []
        for index, scene in enumerate(SCENES):
            frame_path = temp / f"frame-{index:02d}.png"
            render_scene(scene, senior, family, urgent, no_response, medication).save(frame_path, format="PNG", optimize=True)
            frames.append(frame_path)
            speech_path = temp / f"speech-{index:02d}.wav"
            synthesize(scene.speech, speech_path, powershell)
            _, raw = read_pcm(speech_path)
            scene_audio.append((scene, raw))

        audio_path = temp / "narration.wav"
        write_master_audio(scene_audio, audio_path)
        concat_path = temp / "frames.txt"
        write_concat_list(frames, concat_path)
        command = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_path),
            "-i",
            str(audio_path),
            "-t",
            str(TOTAL_SECONDS),
            "-r",
            str(FPS),
            "-vf",
            "format=yuv420p",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-ar",
            "44100",
            "-movflags",
            "+faststart",
            str(output),
        ]
        result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if result.returncode != 0:
            raise RuntimeError(result.stderr[-4000:])
    print(f"Wrote {output} ({output.stat().st_size:,} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent / "安心问候-MVP展示视频.mp4",
        help="Output MP4 path",
    )
    args = parser.parse_args()
    build(args.output.resolve())


if __name__ == "__main__":
    main()
