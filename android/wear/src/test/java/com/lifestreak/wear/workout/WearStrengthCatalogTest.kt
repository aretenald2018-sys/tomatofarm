package com.lifestreak.wear.workout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WearStrengthCatalogTest {
    private fun fullContextJson(): String = """
        {
          "payloadVersion": 1,
          "type": "strength-context",
          "generatedAt": 1700000000000,
          "catalog": [
            {
              "muscleId": "chest",
              "muscleName": "가슴",
              "exercises": [
                {
                  "exerciseId": "bench-press",
                  "name": "바벨 벤치프레스",
                  "movementId": "barbell-press",
                  "stepKg": 2.5,
                  "lastSession": {
                    "dateKey": "2026-07-28",
                    "sets": [
                      { "kg": 40, "reps": 10, "romPct": 100, "setType": "warmup", "done": true },
                      { "kg": 80, "reps": 8, "romPct": 100, "setType": "main", "done": true, "rir": 2 },
                      { "kg": 82.5, "reps": 6, "romPct": 90, "setType": "main", "done": false }
                    ]
                  }
                },
                {
                  "exerciseId": "incline-db-press",
                  "name": "인클라인 덤벨 프레스",
                  "movementId": "dumbbell-press",
                  "stepKg": 2.5,
                  "lastSession": null
                }
              ]
            },
            {
              "muscleId": "back",
              "muscleName": "등",
              "exercises": [
                { "exerciseId": "lat-pulldown", "name": "랫풀다운", "movementId": "cable-pulldown", "stepKg": 5 }
              ]
            }
          ],
          "recentExerciseIds": ["lat-pulldown", "bench-press", "unknown-id"]
        }
    """.trimIndent()

    @Test
    fun parsesFullContextIntoGroupsAndExercises() {
        val catalog = WearStrengthCatalog.parse(fullContextJson())

        assertEquals(1700000000000L, catalog.generatedAt)
        assertEquals(2, catalog.catalogGroups.size)
        assertEquals("chest", catalog.catalogGroups[0].muscleId)
        assertEquals(2, catalog.catalogGroups[0].exercises.size)
        assertEquals("lat-pulldown", catalog.catalogGroups[1].exercises[0].exerciseId)
    }

    @Test
    fun findExerciseResolvesById() {
        val catalog = WearStrengthCatalog.parse(fullContextJson())
        val exercise = catalog.findExercise("bench-press")
        assertEquals("바벨 벤치프레스", exercise?.name)
        assertNull(catalog.findExercise("does-not-exist"))
    }

    @Test
    fun recentExercisesResolveInOrderAndSkipUnknownIds() {
        val catalog = WearStrengthCatalog.parse(fullContextJson())
        assertEquals(listOf("lat-pulldown", "bench-press"), catalog.recentExercises.map { it.exerciseId })
    }

    @Test
    fun topSetPicksHeaviestDoneNonWarmupSet() {
        val catalog = WearStrengthCatalog.parse(fullContextJson())
        val benchPress = catalog.findExercise("bench-press")!!
        // 40kg warmup excluded, 82.5kg not done excluded -> 80kg/8 remains.
        val top = benchPress.lastSession?.topSet()
        assertEquals(80.0, top?.kg)
        assertEquals(8, top?.reps)
        assertEquals(2, top?.rir)
    }

    @Test
    fun rirParsesWhenPresentAndValid() {
        val catalog = WearStrengthCatalog.parse(fullContextJson())
        val sets = catalog.findExercise("bench-press")!!.lastSession!!.sets
        assertEquals(2, sets[1].rir) // the 80kg/8 main set carries "rir": 2 in fullContextJson()
    }

    @Test
    fun rirIsNullWhenAbsentOutOfRangeOrNonInt() {
        val json = """
            {
              "payloadVersion": 1,
              "type": "strength-context",
              "generatedAt": 1,
              "catalog": [
                {
                  "muscleId": "chest",
                  "muscleName": "가슴",
                  "exercises": [
                    {
                      "exerciseId": "bench-press",
                      "name": "벤치프레스",
                      "movementId": "m",
                      "stepKg": 2.5,
                      "lastSession": {
                        "dateKey": "2026-07-28",
                        "sets": [
                          { "kg": 20, "reps": 10, "romPct": 100, "setType": "main", "done": true },
                          { "kg": 20, "reps": 10, "romPct": 100, "setType": "main", "done": true, "rir": 9 },
                          { "kg": 20, "reps": 10, "romPct": 100, "setType": "main", "done": true, "rir": -1 },
                          { "kg": 20, "reps": 10, "romPct": 100, "setType": "main", "done": true, "rir": "high" }
                        ]
                      }
                    }
                  ]
                }
              ],
              "recentExerciseIds": []
            }
        """.trimIndent()

        val sets = WearStrengthCatalog.parse(json).findExercise("bench-press")!!.lastSession!!.sets
        assertNull(sets[0].rir) // absent
        assertNull(sets[1].rir) // out of range (> 5)
        assertNull(sets[2].rir) // out of range (< 0)
        assertNull(sets[3].rir) // non-numeric
    }

    @Test
    fun topSetFallsBackToFirstSetWhenNothingQualifies() {
        val session = WearStrengthLastSession(
            dateKey = "2026-07-28",
            sets = listOf(
                WearStrengthLastSet(kg = 20.0, reps = 12, romPct = 100, setType = "warmup", done = true),
                WearStrengthLastSet(kg = 25.0, reps = 10, romPct = 100, setType = "main", done = false),
            ),
        )
        assertEquals(20.0, session.topSet()?.kg)
    }

    @Test
    fun lastRecordLabelFormatsKgWithoutTrailingZeroAndDateAsMonthSlashDay() {
        val catalog = WearStrengthCatalog.parse(fullContextJson())
        val benchPress = catalog.findExercise("bench-press")!!
        assertEquals("지난 기록 80kg×8 · 7/28", benchPress.lastRecordLabel())
    }

    @Test
    fun lastRecordLabelKeepsHalfKgDecimal() {
        val exercise = WearStrengthExercise(
            exerciseId = "x",
            name = "x",
            muscleId = "chest",
            movementId = "m",
            stepKg = 2.5,
            lastSession = WearStrengthLastSession(
                dateKey = "2026-01-05",
                sets = listOf(WearStrengthLastSet(kg = 82.5, reps = 6, romPct = 100, setType = "main", done = true)),
            ),
        )
        assertEquals("지난 기록 82.5kg×6 · 1/5", exercise.lastRecordLabel())
    }

    @Test
    fun lastRecordLabelIsNullWithoutLastSession() {
        val catalog = WearStrengthCatalog.parse(fullContextJson())
        val exercise = catalog.findExercise("incline-db-press")!!
        assertNull(exercise.lastRecordLabel())
    }

    @Test
    fun skipsMalformedMuscleGroupsAndExercisesWithoutFailing() {
        val json = """
            {
              "payloadVersion": 1,
              "type": "strength-context",
              "generatedAt": 1,
              "catalog": [
                { "muscleId": "", "muscleName": "무명", "exercises": [] },
                { "muscleId": "legs", "exercises": [] },
                {
                  "muscleId": "arms",
                  "muscleName": "팔",
                  "exercises": [
                    { "exerciseId": "", "name": "이름 없음", "movementId": "m", "stepKg": 2.5 },
                    { "exerciseId": "curl", "name": "덤벨 컬", "movementId": "curl", "stepKg": 2.5 },
                    "not-an-object"
                  ]
                }
              ],
              "recentExerciseIds": []
            }
        """.trimIndent()

        val catalog = WearStrengthCatalog.parse(json)
        assertEquals(1, catalog.catalogGroups.size)
        assertEquals("arms", catalog.catalogGroups[0].muscleId)
        assertEquals(1, catalog.catalogGroups[0].exercises.size)
        assertEquals("curl", catalog.catalogGroups[0].exercises[0].exerciseId)
    }

    @Test
    fun defaultsStepKgWhenMissingOrInvalid() {
        val json = """
            {
              "payloadVersion": 1,
              "type": "strength-context",
              "generatedAt": 1,
              "catalog": [
                {
                  "muscleId": "chest",
                  "muscleName": "가슴",
                  "exercises": [
                    { "exerciseId": "a", "name": "a", "movementId": "m", "stepKg": -1 },
                    { "exerciseId": "b", "name": "b", "movementId": "m" }
                  ]
                }
              ],
              "recentExerciseIds": []
            }
        """.trimIndent()

        val catalog = WearStrengthCatalog.parse(json)
        val exercises = catalog.catalogGroups[0].exercises
        assertTrue(exercises.all { it.stepKg == 2.5 })
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsWrongEnvelopeType() {
        WearStrengthCatalog.parse(
            """{"payloadVersion":1,"type":"strength","generatedAt":1,"catalog":[],"recentExerciseIds":[]}""",
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsWrongPayloadVersion() {
        WearStrengthCatalog.parse(
            """{"payloadVersion":2,"type":"strength-context","generatedAt":1,"catalog":[],"recentExerciseIds":[]}""",
        )
    }
}
