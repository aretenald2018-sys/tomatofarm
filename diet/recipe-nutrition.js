export function calcPerServing(recipe = {}) {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  if (!ingredients.length) return null;

  const servings = Number(recipe.servings) || 1;
  const totals = ingredients.reduce((result, ingredient = {}) => {
    result.kcal += Number(ingredient.kcal) || 0;
    result.protein += Number(ingredient.protein) || 0;
    result.carbs += Number(ingredient.carbs) || 0;
    result.fat += Number(ingredient.fat) || 0;
    result.grams += Number(ingredient.grams) || 0;
    return result;
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0, grams: 0 });

  return {
    kcal: Math.round(totals.kcal / servings),
    protein: Math.round(totals.protein / servings * 10) / 10,
    carbs: Math.round(totals.carbs / servings * 10) / 10,
    fat: Math.round(totals.fat / servings * 10) / 10,
    grams: Math.round(totals.grams / servings),
  };
}
