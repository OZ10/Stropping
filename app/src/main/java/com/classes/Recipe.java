package com.classes;

import java.util.ArrayList;

/**
 * Created by Austen on 08/08/2016.
 */
public class Recipe extends BaseItem {

    public Recipe()
    {
        this.ingredients = new ArrayList<>();
    }

    public Recipe(String name, ArrayList<Ingredient> ingredients)
    {
        this.name = name;
        this.ingredients = ingredients;
    }

    public Recipe(String name)
    {
        this.name = name;
        this.ingredients = new ArrayList<>();
    }

    private ArrayList<Ingredient> ingredients;

    public ArrayList<Ingredient> getIngredients()
    {
        return ingredients;
    }

    public void addIngredient(Ingredient ingredient)
    {
        this.ingredients.add(ingredient);
    }

    public void removeIngredient(Ingredient ingredient)
    {
        this.ingredients.remove(ingredient);
    }
}
