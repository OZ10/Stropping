package com.adapters;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.support.design.widget.Snackbar;
import android.support.v7.widget.CardView;
import android.support.v7.widget.RecyclerView;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;

import com.adapters.database.StroppingDatabase;
import com.classes.Ingredient;
import com.classes.Recipe;
import com.oz10.stropping.R;
import com.oz10.stropping.RecipeEditActivity;
import com.oz10.stropping.ShoppingListFragment;

import java.util.ArrayList;
import java.util.List;

/**
 * Created by Austen on 08/08/2016.
 */
public class RecipeListAdapter extends RecyclerView.Adapter<RecipeListAdapter.RecipeViewHolder> {

    public static class RecipeViewHolder extends RecyclerView.ViewHolder{
        CardView cardView;
        TextView recipeId;
        TextView recipeName;
        Button addToShoppingListButton;
        ImageView recipeImage;

        RecipeViewHolder(View view){
            super(view);
            cardView = (CardView)view.findViewById(R.id.recipe_card_view);
            recipeId = (TextView)view.findViewById(R.id.recipe_id);
            recipeName = (TextView)view.findViewById(R.id.recipe_name);
            recipeImage = (ImageView)view.findViewById(R.id.recipe_imageView);
            addToShoppingListButton = (Button)view.findViewById(R.id.recipe_addButton);

            cardView.setOnClickListener(new View.OnClickListener(){
                @Override public void onClick(View view){
                    Intent intent = new Intent(cardView.getContext(), RecipeEditActivity.class);
                    intent.putExtra("RecipeId", Long.parseLong(recipeId.getText().toString()));
                    intent.putExtra("requestCode", 2);
                    cardView.getContext().startActivity(intent);
                }
            });

            addToShoppingListButton.setOnClickListener(new View.OnClickListener(){
                @Override public void onClick(View view){
                    StroppingDatabase db = new StroppingDatabase(view.getContext());
                    db.open();

                    ArrayList<Ingredient> ingredients = db.getRecipeIngredientsById(Long.parseLong(recipeId.getText().toString()));
                    for (Ingredient ingredient:ingredients
                         ) {
                        db.createShoppingListItem(ingredient.getId(), ingredient.getQuantity(), 0);
                    }

                    db.close();

                    String message = (ingredients.size() > 0) ? ingredients.size() + " ingredients added to shopping list" : "no ingredients associated with recipe";

                    Snackbar snackbar = Snackbar.make(view, message , Snackbar.LENGTH_SHORT);
                    snackbar.show();
                }
            });
        }
    }

    List<Recipe> recipes;

    public RecipeListAdapter(List<Recipe> recipes){
        this.recipes = recipes;
    }

    @Override
    public RecipeViewHolder onCreateViewHolder(ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_recipe, parent, false);
        RecipeViewHolder recipeViewHolder = new RecipeViewHolder(view);
        return recipeViewHolder;
    }

    @Override
    public void onBindViewHolder(RecipeViewHolder recipeViewHolder, int position) {
        Recipe recipe = recipes.get(position);
        recipeViewHolder.recipeId.setText(recipe.getId().toString());
        recipeViewHolder.recipeName.setText(recipe.getName());

        if (!recipe.getRecipeImage().equals("")){
            recipeViewHolder.recipeImage.setImageURI(Uri.parse(recipe.getRecipeImage()));
        }
    }

    @Override
    public int getItemCount() {
        return recipes.size();
    }

    @Override
    public void onAttachedToRecyclerView(RecyclerView recyclerView) {
        super.onAttachedToRecyclerView(recyclerView);
    }

    public void add(Recipe recipe)
    {
        recipes.add(recipe);
    }

    public void updateAdapterFromDatabase(Context context)
    {
        StroppingDatabase db = new StroppingDatabase(context);
        db.open();

        this.recipes.clear();

        ArrayList<Recipe> recipes = db.getAllRecipes();
        for (Recipe recipe:recipes
             ) {
            add(recipe);
        }

        notifyDataSetChanged();

        db.close();

    }
}
