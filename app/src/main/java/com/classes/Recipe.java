package com.classes;

import com.oz10.stropping.R;

import java.util.ArrayList;

/**
 * Created by Austen on 08/08/2016.
 */
public class Recipe extends BaseItem {

    private int recipeImage = R.drawable.ic_pot_mix_grey600_24dp;
    private int serves;
    private String notes;

    public Long getId(){
        return id;
    }

    public void setId(Long id){
        this.id = id;
    }

    public int getRecipeImage(){
        return recipeImage;
    }

    public void setRecipeImage(int recipeImage){
        this.recipeImage = recipeImage;
    }

    public int getServes(){
        return serves;
    }

    public void setServes(int serves){
        this.serves = serves;
    }

    public String getNotes(){
        return notes;
    }

    public void setNotes(String notes){
        this.notes = notes;
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




    public Recipe()
    {
        this.id = new Long(0);
        this.ingredients = new ArrayList<>();
    }

//    public Recipe(String name, ArrayList<Ingredient> ingredients)
//    {
//        this.name = name;
//        this.ingredients = ingredients;
//    }

//    public Recipe(String name)
//    {
//        this.name = name;
//        this.ingredients = new ArrayList<>();
//    }
}
