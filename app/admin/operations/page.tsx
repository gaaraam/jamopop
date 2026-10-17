'use client';
import { useEffect, useState } from 'react';
import { ServiceHeader } from '@/components/game/service-header';
import '../admin.css';
import './operations.css';
type Preview = { rows: { label: string; days: number; count: number }[]; generatedAt: number };
export default function Operations() {
  const [data, setData] = useState<Preview | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/operations', { signal: controller.signal })
      .then(async (r) => {
        const d = (await r.json()) as Preview & { error?: string };
        if (!r.ok) throw Error(d.error);
        setData(d);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, []);
  return (
    <main className="admin-page operations-page">
      <ServiceHeader active="admin" title="데이터 보관" />
      <section className="admin-panel">
        <a href="/admin">← 운영 대시보드</a>
        <h2>보관 기간 점검</h2>
        <p>기준일 2026.10.18 · 대상 건수 미리보기</p>
        <p>
          게임 전적·재화·스킨·가구는 정리 대상에 포함하지 않습니다. 아래 데이터의 실제 정리는 별도
          검토 후 실행합니다.
        </p>
        {error && <p role="alert">{error}</p>}
        {!data && !error && <p role="status">확인 중…</p>}
        {data && (
          <>
            <div className="admin-table">
              <table>
                <caption>기간이 지난 데이터</caption>
                <thead>
                  <tr>
                    <th scope="col">종류</th>
                    <th scope="col">보관 기간</th>
                    <th scope="col">대상</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.label}>
                      <th scope="row">{r.label}</th>
                      <td>{r.days}일</td>
                      <td>{r.count.toLocaleString()}건</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>미리보기 {new Date(data.generatedAt).toLocaleString('ko-KR')}</p>
          </>
        )}
        <h2>자동 정리 범위</h2>
        <p>
          매일 만료된 로그인 세션·삭제 미리보기·완료 조회 코드·요청 제한 카운터를 종류별 최대
          500건씩 정리합니다. 유효한 세션과 완료 감사 기록은 유지합니다.
        </p>
        <h2>백업과 로그</h2>
        <p>
          수동 백업은 30일 보관 후 운영자가 만료 목록을 검토합니다. 제공자 로그·자동 복구 지점은
          요금제에 따른 실제 보관 기간을 별도로 확인합니다.
        </p>
      </section>
    </main>
  );
}
