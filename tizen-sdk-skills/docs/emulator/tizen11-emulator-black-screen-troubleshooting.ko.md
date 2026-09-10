# Tizen 11 에뮬레이터 생성·실행 및 검은 화면 트러블슈팅 기록

> 작성일: 2026-08-28
> 환경: Ubuntu 22.04 호스트 (glibc 2.35, sudo 불가), Tizen SDK `/home/user/tizen-sdk`

이 문서는 Tizen 11 / Tizen 10 에뮬레이터를 생성·실행하는 과정에서 발생한 문제들과
해결 과정을 시간순으로 기록한 세션 로그입니다.

## 요약

| 단계 | 증상 | 원인 | 해결 |
|---|---|---|---|
| 1. Tizen 11 VM 생성 실패 | `java.lang.NoSuchFieldError: isVirgl` | emulator-manager 코어와 플랫폼 플러그인 버전 불일치 | `tizen-update-package`로 SDK 패키지 업데이트 후 생성 성공 |
| 2. 첫 실행 실패 | `libSDL2-2.0.so.0: cannot open shared object file` | SDK 패키지 업데이트가 emulator-v2의 호스트 라이브러리 워크어라운드를 덮어씀 | jammy 라이브러리 + virgl 스텁 재적용 |
| 3. sdb 연결 타임아웃 | 부팅은 정상(게스트 IP 할당)인데 sdb 대기 300초 초과 | sdb 서버가 새 에뮬레이터를 인식 못함 | `sdb kill-server && sdb start-server` 후 즉시 인식 |
| 4. 검은 화면 (1차) | 창에 "Display output is not active." | virgl 스텁이 `virgl_renderer_resource_get_info_ext`를 무조건 -1로 반환 → `SET_SCANOUT(0x103)`이 `INVALID_RESOURCE_ID(0x1203)`로 무한 실패 | 스텁을 0.9.1의 `virgl_renderer_resource_get_info`로 위임하도록 재작성 |
| 5. 검은 화면 (2차) | 창 크기는 정상화됐지만 내용이 여전히 검정 | 호스트 virglrenderer 0.9.1이 Tizen 11 게스트 GL 스택에 비해 너무 오래됨 — 게스트 GL 렌더링 결과가 전부 검은색 | **virglrenderer 1.1.1 소스 빌드로 교체 → 홈 화면 정상 출력 확인** |

Tizen 10 에뮬레이터는 구버전 에뮬레이터 바이너리를 사용하므로 위 워크어라운드 없이
정상 생성·실행·화면 출력이 됐습니다.

## 타임라인 상세

### 1. Tizen 11 에뮬레이터 생성 — `NoSuchFieldError: isVirgl`

`tizen-create-emulator` 스킬로 생성 시도 (`create --vm-name tizen11-vm --size 1080`):

```
java.lang.NoSuchFieldError: isVirgl
  at org.tizen.emulator.manager.tizen.vms.option.MDefaultOption.getLaunchArgument(...)
```

em-cli(Java 도구)가 VM을 만들기 전에 크래시. 원인은 emulator-manager 코어 패키지가
새 플랫폼 플러그인보다 오래된 버전 불일치였고, `tizen-update-package` 스킬로 SDK
패키지를 업데이트한 뒤 재시도하여 생성에 성공했습니다.

생성 결과: `tizen11-vm`, tizen-11.0-x86_64, HD1080 Tizen (1920x1080), RAM 1024MB, 4 CPU.

> **이후 플러그인에 반영됨:** create 흐름이 이제 이 사례를 자동 감지·안내합니다.
> 액션 실행 전 em-cli 프로브가 `NoSuchFieldError`/`NoSuchMethodError`를 보이면 create는
> VM을 건드리기 전에 즉시 거부되고(머신 라인 `EMCLI_MISMATCH=1`, 옵트아웃
> `TIZEN_EMCLI_GATE=off`), envelope은 `error_code: TIZEN_SDK_EXEC_E002` /
> `error_category: package_version_mismatch`와 함께 `suggested_fix`로
> update-package 실행 + 동일 create 재시도 명령을 담아 돌아옵니다. 단, 아래 2번처럼
> 패키지 업데이트는 `emulator-v2/bin`의 수동 워크어라운드를 덮어쓰므로 업데이트 후
> 재적용이 필요하다는 경고도 함께 표시됩니다.

### 2. 호스트 라이브러리 워크어라운드 재적용

첫 실행에서 `libSDL2-2.0.so.0: cannot open shared object file` 발생. 원인: SDK
패키지 업데이트가 `platforms/tizen-11.0/common/emulator-v2/bin/`의 emulator.sh와
바이너리를 덮어쓰면서, 이전에 적용해 둔 호스트 라이브러리 워크어라운드가 사라짐.

이 호스트(Ubuntu 22.04)는 emulator-v2 바이너리(BIND_NOW)가 요구하는 라이브러리를
배포판 패키지로 제공하지 않으므로, sudo 없이 다음을 재적용했습니다:

- jammy `.deb`에서 추출한 `.so`를 `emulator-v2/bin/`에 배치 (이 디렉터리는
  에뮬레이터의 `LD_LIBRARY_PATH`에 포함됨): `libSDL2-2.0`, `libSDL2_image`,
  `libSDL2_ttf`, `libdecor-0`, `libsndio.so.7`, `libaio.so.1`, `libslirp.so.0`
  (Debian 4.7.0), `libvirglrenderer.so.1.5.4` (jammy 0.9.1)
- `virgl_renderer_resource_get_info_ext` 심볼만 0.9.1에 없어서 `libvirgl-stub.so`를
  만들어 `emulator.sh`에서 `LD_PRELOAD`
- `vm_config.xml`의 `<virgl>`은 반드시 **true** 유지 — false면 legacy v1 에뮬레이터로
  폴백되어 즉시 종료됨

### 3. sdb 연결 타임아웃

부팅은 정상(게스트 IP 10.0.2.15 할당)인데 launch 러너의 sdb 대기가 타임아웃.
`sdb kill-server && sdb start-server`로 sdb 서버를 재시작하자 `emulator-26101`로
즉시 인식되었습니다.

### 4. 검은 화면 1차 — "Display output is not active."

Tizen 10 에뮬레이터는 홈 화면이 정상 출력됐지만 Tizen 11은 창에
"Display output is not active."만 표시. 진단:

- 게스트: enlightenment(display-manager.service) 정상 실행 중, sdb 정상
- 호스트 emulator.log: `virtio_gpu_virgl_process_cmd: ctrl 0x103, error 0x1203`
  무한 반복 — `SET_SCANOUT`이 `INVALID_RESOURCE_ID`로 계속 실패

원인은 스텁이었습니다. `virgl_renderer_resource_get_info_ext`가 무조건 -1(실패)을
반환하니 QEMU가 모든 스캔아웃 리소스를 무효로 판단한 것. 스텁을 다음과 같이
재작성했습니다 — ext 구조체를 0으로 채운 뒤 0.9.1에 존재하는
`virgl_renderer_resource_get_info`로 위임해 base 필드를 채우고 그 결과를 반환:

```c
int virgl_renderer_resource_get_info_ext(int res_handle,
                                         struct virgl_renderer_resource_info_ext *info)
{
   if (!info) return -1;
   memset(info, 0, sizeof(*info));
   return virgl_renderer_resource_get_info(res_handle, &info->base);
}
```

기존 스텁은 `libvirgl-stub.so.bak-fail-only`로 백업. 재시작 후 `error 0x1203`이
로그에서 완전히 사라지고 창 크기도 정상화됐습니다.

### 5. 검은 화면 2차 — 게스트 GL 렌더링 자체가 검정

스캔아웃은 동작하지만 화면 내용이 여전히 검정. 진단 과정:

1. **게스트 프로세스 확인**: `org.tizen.homescreen/bin/runner`, SystemUI, enlightenment
   모두 정상 실행 중. 크래시 덤프 없음.
2. **게스트 측 화면 덤프** (`tizen-screenshot` 스킬 →
   `enlightenment_info -dump_screen`): **게스트가 합성한 최종 화면 자체가 검정** —
   호스트 전달 문제가 아니라 게스트 안 GPU 렌더링 결과가 검다는 결정적 단서.
3. **dlog 확인**: 홈스크린(Flutter)이 TPL/wayland-egl로 버퍼를 활발히
   dequeue→enqueue→commit 중. 앱은 자기가 정상 렌더링한다고 믿고 있음.
4. **enlightenment 상태**: GL 컴포지팅 모드(`GL: on`, HWC_ST=CL)로 정상 합성 중.

결론: 호스트 virglrenderer **0.9.1이 Tizen 11 게스트의 GL 스택(GLES3/최신 caps
전제)에 비해 너무 오래되어**, 게스트 GL 명령이 호스트에서 검은 픽셀로 렌더링됨.
스텁으로 해결 불가능한 버전 격차.

**해결(완료)**: Ubuntu 22.04에는 virglrenderer ≥1.0 패키지가 없고
(noble 패키지는 glibc 2.38 요구) sudo도 없으므로, **virglrenderer 1.1.1을 소스에서
빌드**해 교체했습니다:

- 빌드 도구: `pip3 install --user meson ninja` (호스트 ninja 1.5.3은 너무 오래됨,
  meson 부재). 호스트에 pkg-config도 없어 jammy `pkgconf` deb을 추출해 사용.
- 의존성: jammy dev/runtime deb 약 40개(`libepoxy-dev`, `libdrm-dev`, `libgbm-dev`,
  `libegl-dev`, GL/GLES/glvnd, X11/xcb/wayland 등)를 `apt-get download` + `dpkg -x`로
  sysroot에 추출, `PKG_CONFIG_SYSROOT_DIR`/`PKG_CONFIG_LIBDIR`로 연결.
- 구성: `meson setup -Dplatforms=egl -Dtests=false` — 클래식 virgl만 빌드.
- 설치: `emulator-v2/bin/libvirglrenderer.so.1.9.1` + `libvirglrenderer.so.1` 심볼릭
  링크. 기존 0.9.1은 `libvirglrenderer.so.1.5.4.bak-091`로 백업. 런타임 의존성
  (libepoxy.so.0, libdrm.so.2, libgbm.so.1)은 호스트 시스템 라이브러리로 해결됨.
- `emulator.sh`의 스텁 `LD_PRELOAD` 라인은 주석 처리 (진짜 라이브러리가
  `get_info_ext`를 제공하므로 스텁이 남아 있으면 오히려 가려버림).
- 검증: BIND_NOW 바이너리가 임포트하는 모든 `virgl_renderer_*` 심볼이 새
  라이브러리에서 export됨을 objdump로 확인. 재시작 후 **호스트 창에 Tizen OS 홈
  화면이 정상 출력**, emulator.log에 virgl 오류 없음.

### 남은 이슈 (기록)

- 게스트가 HD1080(1920x1080) 템플릿인데도 출력 모드를 1280x720@75로 잡음
  (`enlightenment_info -output_mode`에서 1280x720이 preferred/current).
- 게스트 측 `enlightenment_info -dump_screen`은 화면이 정상인데도 검은 이미지를
  반환함 (E20 로그: "map_update/damage not implemented in DS backend" — 게스트 덤프
  경로가 GPU 버퍼를 읽지 못함). 이 VM의 신뢰할 수 있는 캡처는 호스트 측 `xwd`
  방식 (tizen-screenshot 러너가 자동 폴백).
- 게스트에서 `resourced`가 약 6초 간격으로 크래시 루프 — 그래픽과 무관하지만
  `/opt/usr/share/crash/dump/`에 덤프가 쌓이므로 디스크 사용량 주의.

## 관련 경로

| 항목 | 경로 |
|---|---|
| emulator-v2 라이브러리/스크립트 | `/home/user/tizen-sdk/platforms/tizen-11.0/common/emulator-v2/bin/` |
| LD_PRELOAD 라인 | 위 디렉터리의 `emulator.sh` (백업: `emulator.sh.bak.<timestamp>`) |
| 실패-반환 구스텁 백업 | 위 디렉터리의 `libvirgl-stub.so.bak-fail-only` |
| 소스 빌드 virglrenderer | 위 디렉터리의 `libvirglrenderer.so.1.9.1` (`libvirglrenderer.so.1` 심볼릭 링크) |
| 구버전 0.9.1 백업 | 위 디렉터리의 `libvirglrenderer.so.1.5.4.bak-091` |
| VM 로그 | `/home/user/tizen-sdk-data/emulator/vms/tizen11-vm/logs/emulator.log` |

## 재발 시 체크리스트

1. `libSDL2 ... cannot open shared object file` 또는
   `undefined symbol: virgl_renderer_*` → SDK 패키지 업데이트가 워크어라운드를
   덮어쓴 것. 라이브러리 배치 + emulator.sh 수정을 재적용.
2. `NoSuchFieldError` 등 em-cli Java 크래시 → `tizen-update-package`로
   emulator-manager 패키지 업데이트.
3. 부팅 정상인데 sdb 타임아웃 → `sdb kill-server && sdb start-server`.
4. "Display output is not active." + `error 0x1203` 반복 →
   `get_info_ext`가 실패를 반환하고 있는 것. 위임형 스텁(또는 진짜 virglrenderer
   ≥1.0)인지 확인.
5. 스캔아웃은 되는데 내용이 검정 → 호스트 virglrenderer가 0.9.1로 되돌아간 것
   (SDK 업데이트가 `libvirglrenderer.so.1` 심볼릭 링크나 emulator.sh를 덮어썼는지
   확인). 소스 빌드본(`libvirglrenderer.so.1.9.1`)으로 링크를 복구하고 스텁
   LD_PRELOAD가 주석 처리되어 있는지 확인.

근본 해결책은 Ubuntu 24.04 호스트(virglrenderer 1.0 패키지 제공) 또는 이 문서처럼
소스 빌드한 virglrenderer ≥1.0이며, 후자가 이 호스트에 적용되어 검증되었습니다.
