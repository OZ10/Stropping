package com.adapters;

import android.content.Context;
import android.support.design.widget.Snackbar;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.TextView;

import com.classes.Ingredient;
import com.oz10.stropping.R;

import java.util.ArrayList;
import java.util.List;

/**
 * Created by Austen on 22/08/2016.
 */
public class IngredientListAdapter extends ArrayAdapter {

    private ArrayList<Ingredient> _ingredientsList = new ArrayList<>();
    public ArrayList<Ingredient> _selectedIngredientsList = new ArrayList<>();

    public IngredientListAdapter(Context context, int resource, List objects) {
        super(context, resource, objects);

        _ingredientsList = (ArrayList<Ingredient>) objects;
    }

    @Override
    public View getView(int position, View convertView, final ViewGroup parent) {

        View view = convertView;

        if (view == null){
            LayoutInflater layoutInflater = LayoutInflater.from(getContext());
            view = layoutInflater.inflate(R.layout.item_ingredient, null);
        }

        final Ingredient ingredient = _ingredientsList.get(position);

        if (ingredient != null){
            SetIngredientName(view, ingredient.getName());

            SetIngredientQuantity(view, ingredient.getQuantityText());

            SetIngredientIsSelected(view, ingredient);
        }

        return view;
    }
    
    private void SetIngredientName(View view, String ingredientName)
    {
        TextView textView = (TextView) view.findViewById(R.id.ingredient_name);
            textView.setOnClickListener(new View.OnClickListener(){
                    @Override
                    public void onClick(View view) {
                        //TODO Open Edit ingredient activity
                        Snackbar snackbar = Snackbar.make(parent, ingredient.getName() + " clicked!", Snackbar.LENGTH_SHORT);
                        snackbar.show();
                    }
                }
            );
            textView.setText(ingredientName);
    }
    
    private void SetIngredientQuantity(View view, String ingredientQuantity)
    {
        TextView textView = (TextView) view.findViewById(R.id.ingredient_quantity);
            textView.setOnClickListener(new View.OnClickListener(){
                                            @Override
                                            public void onClick(View view) {
                                                //TODO Open Edit ingredient activity
                                                String quantity = Integer.toString(ingredient.getQuantity());
                                                Snackbar snackbar = Snackbar.make(parent, quantity + " required!", Snackbar.LENGTH_SHORT);
                                                snackbar.show();
                                            }
                                        }
            );
            textView.setText(ingredientQuantity);
    }

    private void SetIngredientIsSelected(View view, Ingredient ingredient)
    {
        CheckBox checkBox = (CheckBox) view.findViewById(R.id.ingredient_isselected);
            checkBox.setOnClickListener(new View.OnClickListener(){
                    @Override
                    public void onClick(View view) {
                        CheckBox checkBox = (CheckBox) view.findViewById(R.id.ingredient_isselected);
                        ingredient.setIsSelected(checkBox.isChecked());

                        if (ingredient.getIsSelected()){
                            _selectedIngredientsList.add(ingredient);
                        }else{
                            _selectedIngredientsList.remove(ingredient);
                        }
                    }
                }
            );
            checkBox.setChecked(ingredient.getIsSelected());
    }

}
