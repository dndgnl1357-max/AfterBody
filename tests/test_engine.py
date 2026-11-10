"""엔진 검증 테스트 (표준 unittest):  python -m unittest discover tests -v

문헌·공식 값을 정확히 재현하는지, 방향(단조성)이 상식과 맞는지 확인한다.
"""
import unittest

import numpy as np

from engine import DrinkInput, ExerciseInput, FoodInput, Person, Scenario, simulate
from engine import config as C
from engine import physiology as P
from engine import risk as R

ME = Person(sex=1, age=35, height_cm=174, weight_kg=78, sbp=128)


class TestFormulas(unittest.TestCase):
    def test_eer_matches_kdri_table(self):
        # 2025 KDRI 1권 표 12·13 산출값
        self.assertAlmostEqual(P.eer_kcal(1, 24, 69.1, 1.748), 2701, delta=1)
        self.assertAlmostEqual(P.eer_kcal(2, 57, 52.5, 1.567), 1785, delta=1)

    def test_hall_weight_rule(self):
        # 정상상태: 23.9 kcal/일 ≈ 1 kg, 반감기 1년
        steady = P.weight_change_kg(C.KCAL_PER_DAY_PER_KG * 10, 365 * 50)
        self.assertAlmostEqual(steady, 10, delta=0.01)
        self.assertAlmostEqual(P.weight_change_kg(C.KCAL_PER_DAY_PER_KG * 10, 365), 5, delta=0.01)

    def test_exercise_net_excludes_rest(self):
        self.assertEqual(P.exercise_net_kcal(1.0, 70, 60), 0)
        self.assertAlmostEqual(P.exercise_net_kcal(4.3, 60, 60), 198, delta=0.1)

    def test_bac_widmark(self):
        # 남 70 kg, 알코올 30 g 을 6분 만에: 순간흡수 이론 최고치 30/(0.68*70000)*100 = 0.063%
        t, bac, peak, t_peak, sober = P.bac_curve([(20, 30, 0.1)], 1, 70, 20)
        self.assertTrue(0.045 < peak < 0.063, peak)
        # 제거속도 0.015%/h → 최고치 후 대략 peak/0.015 시간 안에 0
        self.assertLess(sober - t_peak, peak / 0.015 + 1.5)
        self.assertGreater(sober - t_peak, peak / 0.015 - 0.5)

    def test_bac_women_higher(self):
        _, _, pm, _, _ = P.bac_curve([(20, 30, 1)], 1, 60, 20)
        _, _, pf, _, _ = P.bac_curve([(20, 30, 1)], 2, 60, 20)
        self.assertGreater(pf, pm)

    def test_glycemic_load(self):
        gl, level, est = P.glycemic_load([(50, 73)])   # 흰쌀밥 탄수 50 g
        self.assertAlmostEqual(gl, 36.5)
        self.assertEqual(level, "높음")
        self.assertFalse(est)


class TestRisk(unittest.TestCase):
    def test_risk_increases_with_bmi(self):
        p = R.disease_probs(50, 1, [22, 26, 30], "never")
        for k in p:
            self.assertTrue(np.all(np.diff(p[k]) > 0), k)

    def test_sbp_literature_values(self):
        # 체중 1 kg 감량 → -1.05, 나트륨 2,300 mg 감량 → -5.8
        self.assertAlmostEqual(float(R.sbp_change(-1, 0, False, 0)[0]), -1.05, places=2)
        self.assertAlmostEqual(float(R.sbp_change(0, -2300, False, 0)[0]), -5.8, places=2)
        self.assertAlmostEqual(float(R.sbp_change(0, 0, False, 3)[0]), -3.5, places=2)
        self.assertAlmostEqual(float(R.sbp_change(0, 0, True, 0)[0]), -5.5, places=2)

    def test_cvd_rr(self):
        self.assertAlmostEqual(float(R.cvd_relative_risk(-10)), 0.80, places=3)
        self.assertAlmostEqual(float(R.cvd_relative_risk(0)), 1.0)


class TestSimulate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = simulate(ME, [
            Scenario("치맥", foods=[FoodInput("치킨", 450)], drinks=[DrinkInput("생맥주", 2)], times_per_week=2),
            Scenario("치킨+물", foods=[FoodInput("치킨", 450)], times_per_week=2),
            Scenario("샐러드+걷기", foods=[FoodInput("샐러드", 300)],
                     exercises=[ExerciseInput("걷기 빠르게", 30)], times_per_week=2),
            Scenario("치킨 더 많이", foods=[FoodInput("치킨", 900)], times_per_week=2),
        ], n_sim=300)
        cls.r = {x["scenario"]: x for x in cls.out["results"]}

    def yr(self, name, key):
        return self.r[name]["long_term"][-1][key]["med"]

    def test_ordering(self):
        self.assertGreater(self.yr("치맥", "weight_change_kg"), self.yr("치킨+물", "weight_change_kg"))
        self.assertGreater(self.yr("치킨+물", "weight_change_kg"), self.yr("샐러드+걷기", "weight_change_kg"))
        self.assertGreater(self.yr("치킨 더 많이", "weight_change_kg"), self.yr("치킨+물", "weight_change_kg"))
        self.assertLess(self.yr("샐러드+걷기", "sbp_change"), 0)

    def test_ranges_ordered(self):
        for x in self.out["results"]:
            k = x["today"]["kcal"]
            self.assertLessEqual(k["p10"], k["med"])
            self.assertLessEqual(k["med"], k["p90"])

    def test_alcohol_only_when_drinking(self):
        self.assertIsNotNone(self.r["치맥"]["today"]["alcohol"])
        self.assertIsNone(self.r["치킨+물"]["today"]["alcohol"])
        self.assertIsNotNone(self.r["치맥"]["today"]["alcohol"]["sober_time"])

    def test_three_month_smaller_than_year(self):
        lt = self.r["치맥"]["long_term"]
        self.assertLess(abs(lt[0]["weight_change_kg"]["med"]), abs(lt[1]["weight_change_kg"]["med"]))

    def test_inbody_bmr_used(self):
        p = Person(sex=1, age=35, height_cm=174, weight_kg=78, bmr_kcal=1700, activity="저활동적")
        out = simulate(p, [Scenario("x", foods=[FoodInput("밥", 210)])], n_sim=50)
        self.assertEqual(out["person"]["eer_kcal"], round(1700 * C.PAL_BY_ACTIVITY["저활동적"]))
        self.assertIn("인바디", out["person"]["energy_source"])

    def test_unknown_food_warns(self):
        out = simulate(ME, [Scenario("x", foods=[FoodInput("ㅁㄴㅇㄹ없는음식")])], n_sim=50)
        self.assertTrue(out["results"][0]["warnings"])


if __name__ == "__main__":
    unittest.main()
