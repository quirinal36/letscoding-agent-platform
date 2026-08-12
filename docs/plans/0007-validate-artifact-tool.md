# MCP `validate_artifact`와 정책 전환 재검증

상태: 구현됨

관련 이슈: #11

## 최종 성공 조건

도구는 다음 조건을 모두 만족할 때만 `decision=PASS`, `pass=true`를 반환한다.

1. 로컬 공용 검사 결과가 성공했다.
2. 서버가 선택한 활성 정책으로 manifest를 독립 재판정한 결과가 성공했다.
3. 작업 시작 정책, 요청의 첫 활성 정책, 응답 직전 활성 정책 버전이 같다.
4. manifest와 로컬 결과의 artifact hash, file-set digest, 파일 수, 해제 크기가 서로
   일치한다.

클라이언트가 보낸 `pass=true`는 서버 판정을 대체하지 않는다. 반대로 로컬 검사는
ZIP CRC, 실제 inflate 크기, symlink 같은 manifest에 없는 사실을 확인하므로
`pass=false`를 서버가 성공으로 뒤집지 않는다. 서버는 요청 전후 active snapshot을
조회하고 도중 변경을 감지하면 마지막 정책으로 manifest를 다시 판정한 뒤
`REVALIDATION_REQUIRED`와 새 `policyVersion`을 반환한다.

## 입력·출력 경계

입력은 파일별 상대 경로·크기·SHA-256, 선언 파일 수·해제 크기, ZIP 압축 크기,
artifact SHA-256, 로컬 검사 요약과 warning waiver만 받는다. 파일은 최대 2,000개로
transport를 제한하고 활성 정책의 더 작은 파일 수·용량 제한은 validator가 판정한다.
ZIP 원문, 파일 내용, 환경변수 값은 받지 않는다.

Schema는 다음 모순을 handler 실행 전에 거부한다.

- SHA-256 형식 오류
- 선언 파일 수와 `files.length` 불일치
- 선언 해제 크기와 파일 크기 합계 불일치
- directory의 압축 크기 또는 ZIP의 압축 크기 누락
- 시작 정책과 로컬 검사 정책 불일치
- manifest와 로컬 결과의 artifact hash·파일 수·해제 크기 불일치

서버는 file-set digest를 다시 계산해 로컬 digest와 비교한다. 결과는 정책 버전,
pass/decision, errors/warnings, 적용된 waiver, 안전한 aggregate metadata를 포함하고
개별 경로·SHA-256을 finding에 복사하지 않는다. warning waiver는 code와 제어 문자가
없는 사유를 요구하며, 정책이 `waivable=false`로 정한 warning에는 적용하지 않는다.

## 사람의 결정, 권장안과 대안

1차 권장안은 이슈 범위대로 ZIP 원문 비전송을 유지하는 것이다. 이 경우 서버는
`artifactSha256` 형식과 로컬 결과와의 일관성을 확인하지만 원문에서 hash를 독립
재계산할 수 없다. 이는 개인정보·학생 소스의 중앙 전송을 피하는 대신 신뢰 경계가
협력적 클라이언트에 남는 절충이다.

악의적인 클라이언트를 보안 경계로 다뤄야 한다면 다음 중 하나를 별도 승인해야 한다.

- 권장 대안: 로컬 검증기 서명/attestation과 공개키 검증
- 더 강한 대안: 크기 제한·격리 저장·보존 기한을 둔 ZIP 업로드와 서버 재해제

두 대안은 현재 비범위이며 개인정보, 키 운영, 저장 비용 결정이 필요하므로 자동으로
도입하지 않았다. 현재 구현을 되돌리려면 #11 PR의 연결 커밋을 revert해
`validate_artifact`를 이전 `TOOL_NOT_IMPLEMENTED` 상태로 되돌린다. 공용 ZIP 검사기는
#6 변경으로 남는다.
